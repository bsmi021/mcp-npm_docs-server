import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// Removed duplicate ConfigurationManager import
import { logger } from "../utils/index.js";

// Import tool registration functions
import { npmDocsTool } from "./npmDocsTool.js";

/**
 * Register all defined tools with the MCP server instance.
 * This function centralizes tool registration logic.
 */
export function registerTools(server: McpServer): void {
    logger.info("Registering tools...");
    // const configManager = ConfigurationManager.getInstance(); // Not needed if no config passed

    // Register each tool, passing necessary config or services
    npmDocsTool(server);

    logger.info("All tools registered.");
}
