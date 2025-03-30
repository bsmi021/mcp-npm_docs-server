import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"; // Reverted import path and name based on guide example
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { TOOL_NAME, TOOL_DESCRIPTION, TOOL_PARAMS, NpmDocsToolArgs } from './npmDocsToolParams.js';
import { NpmDocService } from '../services/index.js'; // Use barrel file
import { NotFoundError, NetworkError, CacheError } from '../types/index.js'; // Import custom errors
import { logger } from '../utils/logger.js'; // Assuming logger exists

/**
 * Registers the 'getNpmPackageDocs' tool with the MCP server.
 * @param server The McpServer instance.
 */
export const npmDocsTool = (server: McpServer): void => { // Reverted type: McpServer
    // Instantiate the NpmDocService.
    // For this simple server, creating it once during registration is fine.
    // If the service had significant state or resource usage, consider a singleton pattern.
    let npmDocService: NpmDocService;
    try {
        npmDocService = new NpmDocService();
        logger.info('NpmDocService instance created for npmDocsTool.');
    } catch (error: any) {
        // If service instantiation fails (e.g., cache init error), log and prevent tool registration.
        logger.error(`FATAL: Failed to instantiate NpmDocService for tool '${TOOL_NAME}': ${error.message}`);
        // Optionally, throw to halt server startup if this tool is critical
        // throw new Error(`Failed to initialize required service for tool ${TOOL_NAME}: ${error.message}`);
        return; // Do not register the tool if service failed
    }

    // Define the asynchronous function that handles the tool execution
    const processNpmDocsRequest = async (args: NpmDocsToolArgs) => {
        // The 'args' object is already validated by the MCP SDK against TOOL_PARAMS (Zod schema)
        // including the default value for forceFresh.
        logger.info(`Received '${TOOL_NAME}' request for package: '${args.packageName}', forceFresh: ${args.forceFresh}`);

        try {
            // Call the service method to get the documentation
            const documentation = await npmDocService.getDocumentation(args.packageName, args.forceFresh);

            // Format the successful output for MCP
            return {
                content: [{
                    type: 'text' as const, // Ensure type is literal 'text'
                    text: JSON.stringify(documentation, null, 2) // Pretty-print JSON
                }]
            };
        } catch (error: any) {
            logger.error(`Error processing '${TOOL_NAME}' for '${args.packageName}':`, error);

            // Map specific service errors to McpError instances
            if (error instanceof NotFoundError) {
                // Using InvalidRequest as ResourceNotFound doesn't seem available
                throw new McpError(
                    ErrorCode.InvalidRequest,
                    error.message // Service provides a user-friendly message
                );
            }
            if (error instanceof NetworkError) {
                // Using InternalError as ServiceUnavailable/UpstreamServiceError don't seem available
                throw new McpError(
                    ErrorCode.InternalError,
                    `Upstream network error: ${error.message}` // Add context
                );
            }
            if (error instanceof CacheError) {
                // Decide how to treat cache errors - InternalError seems appropriate
                // as it's an issue within the server's own mechanism.
                throw new McpError(
                    ErrorCode.InternalError,
                    `Cache interaction failed: ${error.message}`
                );
            }
            if (error instanceof McpError) {
                throw error; // Re-throw existing McpErrors if any slipped through
            }

            // Generic fallback for unexpected errors
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to get documentation for '${args.packageName}': ${errorMessage}`
            );
        }
    };

    // Register the tool with the MCP server instance
    server.tool(
        TOOL_NAME,
        TOOL_DESCRIPTION,
        TOOL_PARAMS, // Pass the Zod schema object directly
        processNpmDocsRequest // Pass the async handler function
    );

    logger.info(`Tool registered successfully: '${TOOL_NAME}'`);

    // Optional: Add cleanup hook if needed (e.g., close DB connection on server shutdown)
    // server.on('close', () => {
    //     logger.info(`Closing resources for tool '${TOOL_NAME}'...`);
    //     npmDocService.close();
    // });
};
