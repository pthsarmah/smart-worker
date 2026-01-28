import { appConfig } from "../config";
import { logger } from "../logger";

// Export worker types
export { loginWorker } from "./login-worker";
export { hazardWorker } from "./hazard-worker";

/**
 * Initialize workers based on configuration.
 *
 * By default, loads the production login worker.
 * Set HAZARD_TESTING=true to load the hazard worker for testing.
 */
export async function initializeWorkers() {
    const useHazardWorker = process.env.HAZARD_TESTING === "true";

    if (useHazardWorker) {
        logger.info("Loading hazard worker for testing");
        await import("./hazard-worker");
    } else {
        logger.info("Loading production login worker");
        await import("./login-worker");
    }
}

// Auto-initialize if this module is imported directly and not in sandbox context
if (appConfig.executionContext === "host") {
    // The worker will be initialized when this module is imported
    // The dynamic import in initializeWorkers allows for conditional loading
}
