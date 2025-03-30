import { z } from 'zod';

// Define the unique name for the tool
export const TOOL_NAME = "getNpmPackageDocs"; // Changed slightly for clarity

// Provide a clear description for the LLM (and humans)
export const TOOL_DESCRIPTION = `Retrieves documentation and metadata for a specified NPM package.
This tool fetches package information (like description, version, author, dependencies, README)
from the NPM registry, utilizing a local cache (SQLite) for faster responses and to reduce
load on the registry. You can force a fresh fetch to bypass the cache.`;

// Define the parameters the tool accepts using Zod for validation and description
export const TOOL_PARAMS = {
    packageName: z.string().min(1).describe(
        "REQUIRED. The exact name of the NPM package to retrieve documentation for (e.g., 'react', 'express', '@azure/storage-blob'). Case-sensitive matching the NPM registry."
    ),
    forceFresh: z.boolean().optional().default(false).describe(
        "Optional. If set to true, the tool will bypass the local cache and fetch the latest documentation directly from the NPM registry. Defaults to false (uses cache if available and valid)."
    )
};

// Optional: Define a type alias from the Zod schema for type safety in the tool implementation
export type NpmDocsToolArgs = z.infer<z.ZodObject<{
    packageName: z.ZodString;
    forceFresh: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}>>; // Manually define based on TOOL_PARAMS structure
