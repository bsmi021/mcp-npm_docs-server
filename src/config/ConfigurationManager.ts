import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import config types for services as they are added
// import { ExampleServiceConfig } from '../types/index.js'; // Removed example import
import { NpmDocServiceConfig } from '../types/index.js';

// Define the structure for all configurations managed
interface ManagedConfigs {
    // exampleService: Required<ExampleServiceConfig>; // Removed example config
    npmDocService: Required<NpmDocServiceConfig>;
    // Add other service config types here:
    // yourService: Required<YourServiceConfig>;
}

/**
 * Centralized configuration management for all services.
 * Implements singleton pattern to ensure consistent configuration.
 */
export class ConfigurationManager {
    private static instance: ConfigurationManager | null = null;
    private static instanceLock = false;

    private config: ManagedConfigs;

    private constructor() {
        // Helper to get the directory name in ES module scope
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        // Default DB path relative to the *compiled* config file location (inside dist)
        const defaultDbPath = path.resolve(__dirname, '../', 'npm-docs-cache.db'); // Resolve to parent (dist) then add filename

        // Initialize with default configurations
        this.config = {
            // Removed exampleService defaults
            npmDocService: {
                cacheTtl: 86400, // Default: 24 hours
                dbPath: defaultDbPath, // Use resolved default path
                npmRegistry: 'https://registry.npmjs.org', // Default registry (though unused currently)
            },
            // Initialize other service configs with defaults:
            // yourService: {
            //   someSetting: 'default value',
            //   retryCount: 3,
            // },
        };

        // Optional: Load overrides from environment variables or config files here
        this.loadEnvironmentOverrides();
    }

    /**
     * Get the singleton instance of ConfigurationManager.
     * Basic lock to prevent race conditions during initial creation.
     */
    public static getInstance(): ConfigurationManager {
        if (!ConfigurationManager.instance) {
            if (!ConfigurationManager.instanceLock) {
                ConfigurationManager.instanceLock = true; // Lock
                try {
                    ConfigurationManager.instance = new ConfigurationManager();
                } finally {
                    ConfigurationManager.instanceLock = false; // Unlock
                }
            } else {
                // Basic busy wait if locked (consider a more robust async lock if high contention is expected)
                while (ConfigurationManager.instanceLock) { }
                // Re-check instance after wait
                if (!ConfigurationManager.instance) {
                    // This path is less likely but handles edge cases if lock logic needs refinement
                    return ConfigurationManager.getInstance();
                }
            }
        }
        return ConfigurationManager.instance;
    }

    // --- Getters for specific configurations ---

    // Removed getExampleServiceConfig()

    // Add getters for other service configs:
    public getNpmDocServiceConfig(): Required<NpmDocServiceConfig> {
        return { ...this.config.npmDocService };
    }
    // public getYourServiceConfig(): Required<YourServiceConfig> {
    //   return { ...this.config.yourService };
    // }

    // --- Updaters for specific configurations (if runtime updates are needed) ---

    // Removed updateExampleServiceConfig()

    // Add updaters for other service configs:
    public updateNpmDocServiceConfig(update: Partial<NpmDocServiceConfig>): void {
        this.config.npmDocService = {
            ...this.config.npmDocService,
            ...update,
        };
    }
    // public updateYourServiceConfig(update: Partial<YourServiceConfig>): void {
    //   this.config.yourService = {
    //     ...this.config.yourService,
    //     ...update,
    //   };
    // }

    /**
     * Example method to load configuration overrides from environment variables.
     * Call this in the constructor.
     */
    private loadEnvironmentOverrides(): void {
        // Removed ExampleService env var logic

        // Add logic for NpmDocService environment variables
        if (process.env.NPM_CACHE_TTL) {
            const ttl = parseInt(process.env.NPM_CACHE_TTL, 10);
            if (!isNaN(ttl) && ttl > 0) {
                this.config.npmDocService.cacheTtl = ttl;
            }
        }
        if (process.env.NPM_CACHE_DB_PATH) {
            // If env var is set, use it directly (could be absolute or relative to CWD)
            this.config.npmDocService.dbPath = process.env.NPM_CACHE_DB_PATH;
        }
        // Note: NPM_REGISTRY_URL is currently unused as npms.io is hardcoded
        if (process.env.NPM_REGISTRY_URL) {
            this.config.npmDocService.npmRegistry = process.env.NPM_REGISTRY_URL;
        }

        // Add logic for other services based on their environment variables
        // if (process.env.YOUR_SERVICE_RETRY_COUNT) {
        //   const retryCount = parseInt(process.env.YOUR_SERVICE_RETRY_COUNT, 10);
        //   if (!isNaN(retryCount)) {
        //     this.config.yourService.retryCount = retryCount;
        //   }
        // }
    }
}
