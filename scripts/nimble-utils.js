// Utility/helper functions for Nimble Action Tracker
// Exports: canPlayerOpenTracker, other helpers as needed

export function canPlayerOpenTracker(options = {}) {
    if (game.user.isGM) return true;
    if (options.allowSocketOpen) return true;
    return true;
}

// Add other utility functions here as needed
