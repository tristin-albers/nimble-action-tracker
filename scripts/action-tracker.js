import { NimbleActionTracker } from './nimble-app.js';

let trackerInstance;

const TOOL_KEY = "nimble-tracker-toggle";
const TOOL_LABEL = "Toggle Nimble Action Tracker";
const TOOL_ICON = "fas fa-dice-d20";

let combatActive = false; // Module-level state for combat

// Helper: Allow players to open tracker at any time
function canPlayerOpenTracker(options = {}) {
    // Always allow GM
    if (game.user.isGM) return true;
    // Always allow socket-triggered open (for GM initiative request)
    if (options.allowSocketOpen) return true;
    // Always allow players to open/close their own tracker
    return true;
}


Hooks.once('init', () => {
    // Instantiate the tracker application so it exists for later hooks
    trackerInstance = new NimbleActionTracker();
    trackerInstance.setCombatActive(combatActive);
    // Register client setting for persistence
    game.settings.register("nimble-action-tracker", "trackerVisible", {
        scope: "client",
        config: false,
        type: Boolean,
        default: false
    });
});


// Listen for flag changes to open/close tracker UI
Hooks.on("updateUser", (user, changes) => {
    if (user.id !== game.user.id) return;
    if (hasProperty(changes, "flags.nimble-action-tracker.showTracker")) {
        const show = getProperty(changes, "flags.nimble-action-tracker.showTracker");
        if (show) {
            combatActive = true;
            if (!trackerInstance) trackerInstance = new NimbleActionTracker();
            trackerInstance.setCombatActive(combatActive);
            trackerInstance.render(true, { allowSocketOpen: true });
        } else {
            combatActive = false;
            if (!trackerInstance) trackerInstance = new NimbleActionTracker();
            trackerInstance.setCombatActive(combatActive);
            trackerInstance.savePositionToLocalStorage();
            trackerInstance.close();
        }
    }
});

// Global initialization
Hooks.once('ready', () => {
    console.log("Nimble Tracker | Ready Hook firing.");

    const shouldShow = game.settings.get("nimble-action-tracker", "trackerVisible");
    if (shouldShow) {
        trackerInstance.setCombatActive(combatActive);
        trackerInstance.render(true);
    }
});

Hooks.on("getSceneControlButtons", (controls) => {
    const add = (group) => {
        if (!group) return false;
        
        // Ensure tools is handled correctly whether it's an Array or Object
        const tools = group.tools;
        const exists = Array.isArray(tools) 
            ? tools.some(t => t?.name === TOOL_KEY) 
            : Boolean(tools[TOOL_KEY]);
            
        if (exists) return true;

        // Debounce utility (if not already defined)
        if (typeof window.nimbleDebounce !== 'function') {
            window.nimbleDebounce = function(func, wait) {
                let timeout;
                return function(...args) {
                    if (timeout) clearTimeout(timeout);
                    timeout = setTimeout(() => func.apply(this, args), wait);
                };
            };
        }

        const tool = {
            name: TOOL_KEY,
            title: TOOL_LABEL,
            icon: TOOL_ICON,
            toggle: true, // This makes the button stay highlighted when active
            active: game.settings.get("nimble-action-tracker", "trackerVisible"),
            onClick: window.nimbleDebounce((active) => {
                game.settings.set("nimble-action-tracker", "trackerVisible", active);
                if (active) {
                    trackerInstance.render(true);
                } else {
                    // Use a fade-out effect before closing if you want to be extra fancy
                    const element = document.getElementById("nimble-action-tracker");
                    if (element) {
                        element.style.opacity = "0";
                        element.style.transition = "opacity 0.3s ease";
                        setTimeout(() => trackerInstance.close(), 300);
                    } else {
                        trackerInstance.close();
                    }
                }
            }, 300)
        };

        if (Array.isArray(tools)) {
            tools.push(tool);
        } else {
            group.tools[TOOL_KEY] = tool;
        }
        return true;
    };

    // Logic to find the correct group (Token or Tiles)
    if (Array.isArray(controls)) {
        const ok = add(controls.find(g => (g.name === "token" || g.name === "tokens")));
        if (!ok) add(controls.find(g => g.name === "tiles"));
    } else if (controls && typeof controls === "object") {
        const ok = add(controls["token"] ?? controls["tokens"]);
        if (!ok) add(controls["tiles"]);
    }
});

// Sidebar Button with explicit jQuery wrapping

// Debounce utility
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

Hooks.on("renderActorDirectory", (app, html) => {
    const button = $(`<button class="nimble-btn"><i class="fas fa-dice-d20"></i> Action Tracker</button>`);
    // Debounce the click to prevent rapid double opens
    button.click(debounce(() => {
        trackerInstance.render(true, {focus: true});
    }, 300));
    $(html).find(".header-actions").append(button);
});

Hooks.on("updateActor", (actor, change) => {
    if (hasProperty(change, "flags.nimble-action-tracker") && trackerInstance) {
        trackerInstance.render(false);
    }
});



