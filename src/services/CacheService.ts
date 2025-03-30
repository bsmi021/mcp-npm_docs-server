import BetterSqlite3 from 'better-sqlite3';
import { CacheEntry, NpmDocumentation, CacheError } from '../types/index.js'; // Use custom CacheError
import { logger } from '../utils/logger.js'; // Assuming logger exists in utils

export class CacheService {
    private db: BetterSqlite3.Database;

    constructor(dbPath: string) {
        // Define a wrapper for the verbose logger to match better-sqlite3's expected signature
        const verboseLog = (message?: unknown, ...additionalArgs: unknown[]): void => {
            // Convert the message to string before logging
            logger.debug(String(message), ...additionalArgs);
        };

        try {
            // Initialize the database connection
            // Pass the wrapper function for verbose logging if LOG_LEVEL is debug
            this.db = new BetterSqlite3(dbPath, { verbose: process.env.LOG_LEVEL === 'debug' ? verboseLog : undefined });
            this.initializeDatabase();
            logger.info(`Cache database initialized successfully at ${dbPath}`);
        } catch (error: any) {
            logger.error(`Failed to initialize cache database at ${dbPath}: ${error.message}`);
            // Throw a specific cache error for better handling upstream
            throw new CacheError(`Cache initialization failed: ${error.message}`);
        }
    }

    /**
     * Creates the cache table if it doesn't exist.
     */
    private initializeDatabase(): void {
        const createTableSQL = `
      CREATE TABLE IF NOT EXISTS npm_docs_cache (
        package_name TEXT PRIMARY KEY,
        documentation TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        ttl INTEGER NOT NULL
      )
    `;
        try {
            this.db.exec(createTableSQL);
            logger.debug('Cache table verified/created.');
        } catch (error: any) {
            logger.error(`Failed to create or verify cache table: ${error.message}`);
            throw new CacheError(`Cache table initialization failed: ${error.message}`);
        }
    }

    /**
     * Retrieves a cache entry for a given package name.
     * Returns null if the entry doesn't exist.
     * @param packageName The name of the package.
     * @returns A Promise resolving to the CacheEntry or null.
     */
    public async get(packageName: string): Promise<CacheEntry | null> {
        logger.debug(`Attempting to get cache for package: ${packageName}`);
        try {
            const stmt = this.db.prepare(
                'SELECT package_name, documentation, fetched_at, ttl FROM npm_docs_cache WHERE package_name = ?'
            );
            // Use .get() for single row retrieval
            const row = stmt.get(packageName) as { package_name: string; documentation: string; fetched_at: number; ttl: number } | undefined;

            if (!row) {
                logger.debug(`Cache miss for package: ${packageName}`);
                return null;
            }

            // Safely parse the documentation JSON
            let documentation: NpmDocumentation;
            try {
                documentation = JSON.parse(row.documentation);
            } catch (parseError: any) {
                logger.error(`Failed to parse cached documentation JSON for ${packageName}: ${parseError.message}. Removing corrupted entry.`);
                // Attempt to remove the corrupted entry
                await this.clearCache(packageName).catch(clearError => logger.error(`Failed to clear corrupted cache entry for ${packageName}: ${clearError}`));
                return null; // Treat as cache miss
            }

            logger.debug(`Cache hit for package: ${packageName}`);
            return {
                packageName: row.package_name,
                documentation,
                fetchedAt: new Date(row.fetched_at), // Convert timestamp back to Date
                ttl: row.ttl,
            };
        } catch (error: any) {
            logger.error(`Failed to get cache entry for package ${packageName}: ${error.message}`);
            // Avoid throwing here, just return null to indicate failure/miss
            return null;
        }
    }

    /**
     * Stores or updates a cache entry.
     * @param packageName The name of the package.
     * @param documentation The documentation object to cache.
     * @param ttl The time-to-live for the cache entry in seconds.
     * @returns A Promise resolving when the operation is complete.
     */
    public async set(packageName: string, documentation: NpmDocumentation, ttl: number): Promise<void> {
        logger.debug(`Attempting to set cache for package: ${packageName} with TTL: ${ttl}s`);
        try {
            const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO npm_docs_cache (package_name, documentation, fetched_at, ttl)
        VALUES (?, ?, ?, ?)
      `);

            const now = Date.now(); // Store as timestamp number
            // Ensure documentation is stringified before storing
            const documentationString = JSON.stringify(documentation);

            // Use .run() for INSERT/UPDATE/DELETE
            stmt.run(
                packageName,
                documentationString,
                now,
                ttl
            );

            logger.info(`Cache set/updated successfully for package: ${packageName}`);
        } catch (error: any) {
            logger.error(`Failed to set cache entry for package ${packageName}: ${error.message}`);
            throw new CacheError(`Cache update failed for ${packageName}: ${error.message}`);
        }
    }

    /**
     * Checks if a valid (non-expired) cache entry exists for the package.
     * @param packageName The name of the package.
     * @returns A Promise resolving to true if cached and valid, false otherwise.
     */
    public async isCached(packageName: string): Promise<boolean> {
        logger.debug(`Checking cache validity for package: ${packageName}`);
        try {
            const cacheEntry = await this.get(packageName);
            if (!cacheEntry) {
                return false; // Not cached
            }

            const { fetchedAt, ttl } = cacheEntry;
            const now = new Date();
            // Calculate expiry time based on fetchedAt + ttl (in milliseconds)
            const expiryTime = new Date(fetchedAt.getTime() + (ttl * 1000));

            const isValid = now < expiryTime;
            logger.debug(`Cache for ${packageName} is ${isValid ? 'valid' : 'expired'}. Fetched: ${fetchedAt.toISOString()}, Expires: ${expiryTime.toISOString()}`);
            return isValid;
        } catch (error: any) {
            // Log error but return false, as we can't confirm cache validity
            logger.error(`Failed during cache validity check for package ${packageName}: ${error.message}`);
            return false;
        }
    }

    /**
     * Clears the cache entry for a specific package or the entire cache.
     * @param packageName Optional. The name of the package to clear. If omitted, clears all entries.
     * @returns A Promise resolving when the operation is complete.
     */
    public async clearCache(packageName?: string): Promise<void> {
        try {
            let stmt;
            if (packageName) {
                logger.info(`Clearing cache for specific package: ${packageName}`);
                stmt = this.db.prepare('DELETE FROM npm_docs_cache WHERE package_name = ?');
                stmt.run(packageName);
                logger.info(`Cache cleared successfully for package: ${packageName}`);
            } else {
                logger.info('Clearing entire cache.');
                stmt = this.db.prepare('DELETE FROM npm_docs_cache');
                stmt.run();
                logger.info('Entire cache cleared successfully.');
            }
        } catch (error: any) {
            logger.error(`Failed to clear cache${packageName ? ` for ${packageName}` : ''}: ${error.message}`);
            throw new CacheError(`Cache clear operation failed: ${error.message}`);
        }
    }

    /**
     * Closes the database connection.
     */
    public close(): void {
        if (this.db && this.db.open) {
            try {
                this.db.close();
                logger.info('Cache database connection closed.');
            } catch (error: any) {
                logger.error(`Failed to close cache database connection: ${error.message}`);
            }
        } else {
            logger.warn('Attempted to close an already closed or uninitialized cache database.');
        }
    }
}
