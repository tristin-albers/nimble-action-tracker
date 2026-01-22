import { NimbleActionTracker } from './nimble-app.js';

let trackerInstance;

const TOOL_KEY = "nimble-tracker-toggle";
const TOOL_LABEL = "Toggle Nimble Action Tracker";
const TOOL_ICON = "fas fa-dice-d20";

// Module-level state for combat
let combatActive = false;

// Initialization
Hooks.once('init', () => {
    trackerInstance = new NimbleActionTracker();
    trackerInstance.setCombatActive(combatActive);
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
    if (foundry.utils.hasProperty(changes, "flags.nimble-action-tracker.showTracker")) {
        const show = foundry.utils.getProperty(changes, "flags.nimble-action-tracker.showTracker");
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
        const tools = group.tools;
        const exists = Array.isArray(tools) 
            ? tools.some(t => t?.name === TOOL_KEY) 
            : Boolean(tools[TOOL_KEY]);
        if (exists) return true;
        const tool = {
            name: TOOL_KEY,
            title: TOOL_LABEL,
            icon: TOOL_ICON,
            toggle: true,
            active: game.settings.get("nimble-action-tracker", "trackerVisible"),
            onChange: foundry.utils.debounce((active) => {
                game.settings.set("nimble-action-tracker", "trackerVisible", active);
                if (active) {
                    trackerInstance.render(true);
                } else {
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
    if (Array.isArray(controls)) {
        const ok = add(controls.find(g => (g.name === "token" || g.name === "tokens")));
        if (!ok) add(controls.find(g => g.name === "tiles"));
    } else if (controls && typeof controls === "object") {
        const ok = add(controls["token"] ?? controls["tokens"]);
        if (!ok) add(controls["tiles"]);
    }
});

Hooks.on("renderActorDirectory", (app, html) => {
    const button = $(`<button class="nimble-btn"><i class="fas fa-dice-d20"></i> Action Tracker</button>`);
    button.click(foundry.utils.debounce(() => {
        trackerInstance.render(true, {focus: true});
    }, 300));
    $(html).find(".header-actions").append(button);
});

// Rerender tracker on actor flag change
Hooks.on("updateActor", (actor, change) => {
    if (foundry.utils.hasProperty(change, "flags.nimble-action-tracker") && trackerInstance) {
        trackerInstance.render(false);
    }
});