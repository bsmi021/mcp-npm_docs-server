// NPM Documentation structure
export interface NpmDocumentation {
    name: string;
    version: string;
    description: string;
    homepage?: string;
    repository?: string; // Could be string or object { type, url }
    author?: string | { name?: string; email?: string; url?: string }; // Can be string or object
    license?: string;
    main?: string;
    keywords?: string[];
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    readme?: string; // README filename or initial content if provided by registry
    readmeContent?: string; // Fetched content of the README file
}

// Cache entry structure
export interface CacheEntry {
    packageName: string;
    documentation: NpmDocumentation;
    fetchedAt: Date;
    ttl: number; // seconds
}

// Configuration for the service
export interface NpmDocServiceConfig {
    cacheTtl: number; // Default TTL in seconds
    dbPath: string;   // Path to SQLite database
    npmRegistry: string; // NPM registry URL
}

// Error types - Let's define some basic custom error classes instead of just enums
export class CacheError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CacheError';
    }
}

export class NetworkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NetworkError';
    }
}

export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';
    }
}

export class ValidationError extends Error {
    public details?: any;
    constructor(message: string, details?: any) {
        super(message);
        this.name = 'ValidationError';
        this.details = details;
    }
}
