import axios from 'axios';
import { CacheService } from './CacheService.js';
import { ConfigurationManager } from '../config/ConfigurationManager.js';
import {
    NpmDocumentation,
    NpmDocServiceConfig,
    CacheError,
    NetworkError,
    NotFoundError
} from '../types/index.js';
import { logger } from '../utils/logger.js'; // Assuming logger exists

// Define a type for the relevant parts of the npms.io response structure
interface NpmsIOResponse {
    collected?: {
        metadata?: {
            name: string;
            version: string;
            description?: string;
            keywords?: string[];
            author?: { name?: string };
            license?: string;
            links?: {
                npm?: string;
                homepage?: string;
                repository?: string;
                bugs?: string;
            };
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
            readme?: string; // This seems to contain the content directly
        };
    };
    // Add other fields if needed (e.g., evaluation, score)
}


export class NpmDocService {
    private readonly config: Required<NpmDocServiceConfig>;
    private cacheService: CacheService;
    private npmsApiBaseUrl = 'https://api.npms.io/v2'; // Define npms.io base URL

    constructor(config?: Partial<NpmDocServiceConfig>) {
        const configManager = ConfigurationManager.getInstance();
        // Get default config and merge any overrides passed to constructor
        const defaultConfig = configManager.getNpmDocServiceConfig();
        this.config = { ...defaultConfig, ...(config || {}) };

        // Initialize cache service with the configured path
        // CacheService constructor handles its own errors, potentially throwing CacheError
        try {
            this.cacheService = new CacheService(this.config.dbPath);
            // Update log message to reflect using npms.io primarily
            logger.info(`NpmDocService initialized [API: ${this.npmsApiBaseUrl}], cache TTL: ${this.config.cacheTtl}s`);
        } catch (error) {
            // If CacheService fails to initialize, NpmDocService cannot function
            logger.error(`NpmDocService failed to initialize CacheService: ${error}`);
            // Re-throw the error (likely a CacheError)
            throw error;
        }
    }

    /**
     * Gets documentation for a package, utilizing the cache unless forceFresh is true.
     * @param packageName The name of the NPM package.
     * @param forceFresh If true, bypasses the cache and fetches directly from the npms.io API.
     * @returns A Promise resolving to the NpmDocumentation.
     * @throws NotFoundError if the package is not found via npms.io.
     * @throws NetworkError for issues connecting to the npms.io API.
     * @throws CacheError for issues interacting with the cache database.
     * @throws Error for other unexpected issues.
     */
    public async getDocumentation(packageName: string, forceFresh = false): Promise<NpmDocumentation> {
        logger.info(`Getting documentation for '${packageName}' (forceFresh=${forceFresh})`);

        // 1. Check cache first (unless forceFresh is true)
        if (!forceFresh) {
            try {
                const isCached = await this.cacheService.isCached(packageName);
                if (isCached) {
                    logger.info(`Using valid cached documentation for '${packageName}'`);
                    const cacheEntry = await this.cacheService.get(packageName);
                    // Ensure cacheEntry is not null, though isCached should guarantee it
                    if (cacheEntry) {
                        return cacheEntry.documentation;
                    } else {
                        // This case is unlikely if isCached was true, but handle defensively
                        logger.warn(`Cache inconsistency: isCached was true but get returned null for '${packageName}'. Fetching fresh.`);
                    }
                } else {
                    logger.info(`No valid cache entry found for '${packageName}'.`);
                }
            } catch (cacheError: any) {
                // Log cache read errors but proceed to fetch from network
                logger.error(`Cache check/read error for '${packageName}': ${cacheError.message}. Attempting fresh fetch.`);
                // Optionally re-throw if cache failure should halt the process: throw cacheError;
            }
        } else {
            logger.info(`Cache bypassed due to forceFresh=true for '${packageName}'.`);
        }

        // 2. Not in cache, expired, or forceFresh: Fetch from npms.io
        logger.info(`Fetching fresh documentation for '${packageName}' from ${this.npmsApiBaseUrl}`);
        let docs: NpmDocumentation;
        try {
            // Call the fetch method for npms.io
            docs = await this.fetchFromNpmsIO(packageName);
        } catch (fetchError) {
            // Re-throw specific errors (NotFoundError, NetworkError) from fetchFromNpmsIO
            logger.error(`Failed to fetch documentation for '${packageName}' from npms.io: ${fetchError}`);
            throw fetchError; // Propagate the specific error
        }

        // 3. Store the freshly fetched documentation in cache
        try {
            await this.cacheService.set(packageName, docs, this.config.cacheTtl);
        } catch (cacheError: any) {
            // Log cache write errors but don't fail the overall operation,
            // as the user still received the fresh data.
            logger.error(`Failed to store fetched documentation in cache for '${packageName}': ${cacheError.message}`);
            // Optionally re-throw if cache write failure is critical: throw cacheError;
        }

        return docs;
    }

    /**
     * Fetches package data from the npms.io API.
     * @param packageName The name of the package.
     * @returns A Promise resolving to the NpmDocumentation.
     * @throws NotFoundError if the package results in a 404 from npms.io.
     * @throws NetworkError for other connection or non-404 HTTP errors.
     */
    private async fetchFromNpmsIO(packageName: string): Promise<NpmDocumentation> {
        const url = `${this.npmsApiBaseUrl}/package/${encodeURIComponent(packageName)}`;
        logger.debug(`Fetching from npms.io URL: ${url}`);
        try {
            const response = await axios.get<NpmsIOResponse>(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': `mcp-npm_docs-server/${process.env.npm_package_version || '0.1.0'}`
                },
                timeout: 15000 // 15 second timeout
            });

            const metadata = response.data?.collected?.metadata;

            if (!metadata || !metadata.name) {
                // Handle cases where npms.io might return 200 but with unexpected data
                // or if the package truly doesn't exist (npms.io might still return 200 sometimes)
                logger.warn(`Package '${packageName}' not found or invalid data from npms.io. URL: ${url}`);
                throw new NotFoundError(`Package '${packageName}' not found via npms.io.`);
            }

            // Extract the documentation fields directly from npms.io response
            const documentation: NpmDocumentation = {
                name: metadata.name,
                version: metadata.version || 'unknown',
                description: metadata.description || '',
                homepage: metadata.links?.homepage,
                repository: metadata.links?.repository,
                author: metadata.author?.name,
                license: metadata.license,
                keywords: metadata.keywords,
                dependencies: metadata.dependencies,
                devDependencies: metadata.devDependencies,
                // Use readme content directly if provided by npms.io
                readmeContent: metadata.readme,
                // Indicate if readme content was included
                readme: metadata.readme ? 'README content included via npms.io' : undefined,
            };

            logger.info(`Successfully fetched documentation for '${packageName}' v${documentation.version} from npms.io`);
            return documentation;

        } catch (error: any) {
            // Catch NotFoundError specifically if thrown above
            if (error instanceof NotFoundError) {
                throw error;
            }

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    // Handle HTTP errors from npms.io
                    if (error.response.status === 404) {
                        logger.warn(`Package '${packageName}' not found via npms.io (404). URL: ${url}`);
                        throw new NotFoundError(`Package '${packageName}' not found.`);
                    } else {
                        logger.error(`HTTP error fetching from npms.io for '${packageName}': ${error.response.status} - ${error.response.statusText}. URL: ${url}`);
                        throw new NetworkError(`Failed to fetch from npms.io: HTTP ${error.response.status} ${error.response.statusText}`);
                    }
                } else if (error.request) {
                    // Handle network errors (no response received)
                    logger.error(`Network error fetching from npms.io for '${packageName}': ${error.message}. URL: ${url}`);
                    throw new NetworkError(`Network error connecting to npms.io: ${error.message}`);
                }
            }
            // Handle other unexpected errors
            logger.error(`Unexpected error fetching from npms.io for '${packageName}': ${error.message}`);
            throw new Error(`An unexpected error occurred while fetching from npms.io: ${error.message}`);
        }
    }

    /**
     * Clears the cache for a specific package or the entire cache.
     * Delegates to CacheService.
     * @param packageName Optional package name to clear.
     */
    public async clearCache(packageName?: string): Promise<void> {
        await this.cacheService.clearCache(packageName);
    }

    /**
     * Checks if a specific package has a valid cache entry.
     * Delegates to CacheService.
     * @param packageName The package name to check.
     * @returns True if cached and valid, false otherwise.
     */
    public async isDocCached(packageName: string): Promise<boolean> {
        return this.cacheService.isCached(packageName);
    }

    /**
     * Closes the underlying CacheService database connection.
     */
    public close(): void {
        logger.info('Closing NpmDocService resources.');
        this.cacheService.close();
    }

    // Removed fetchReadmeFromRepo as npms.io provides readme content directly
}
