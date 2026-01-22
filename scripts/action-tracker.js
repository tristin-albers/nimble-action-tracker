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
    game.settings.register("nimble-action-tracker", "initiativeType", {
        name: "Initiative type",
        hint: "Choose between Standard (default, Nimble core rules with no readiness) or Alternative (uses readiness statuses)",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "alternative": "Alternative",
            "standard": "Standard"
        },
        default: "standard"
    });
    game.settings.register("nimble-action-tracker", "diceSoNiceDetected", {
        name: "'Dice So Nice!' Detected (Read Only)",
        hint: "Shows whether the Dice So Nice! module is active. When active, initiative rolls will pause to show dice animations.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => {} // Prevent changes from doing anything
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
    const shouldShow = game.settings.get("nimble-action-tracker", "trackerVisible");
    if (shouldShow) {
        trackerInstance.setCombatActive(combatActive);
        trackerInstance.render(true);
    }

    // Detect if Dice So Nice! is active and update the setting (GM only)
    if (game.user.isGM) {
        const diceSoNiceActive = game.modules.get('dice-so-nice')?.active ?? false;
        game.settings.set("nimble-action-tracker", "diceSoNiceDetected", diceSoNiceActive);
    }
});

// Disable the Dice So Nice checkbox in settings UI (make it read-only)
Hooks.on('renderSettingsConfig', (_app, html) => {
    const $html = $(html);
    const checkbox = $html.find('input[name="nimble-action-tracker.diceSoNiceDetected"]');
    if (checkbox.length) {
        checkbox.prop('disabled', true);
        checkbox.css('cursor', 'not-allowed');
        checkbox.closest('.form-group').css('opacity', '0.6');
    }
});

Hooks.on("getSceneControlButtons", (controls) => {
    // Define the toggle handler
    const handleToggle = () => {
        // Toggle the current state
        const currentState = game.settings.get("nimble-action-tracker", "trackerVisible");
        const newState = !currentState;
        game.settings.set("nimble-action-tracker", "trackerVisible", newState);

        // Ensure instance exists
        if (!trackerInstance) {
            trackerInstance = new NimbleActionTracker();
            trackerInstance.setCombatActive(combatActive);
        }

        if (newState) {
            trackerInstance.render(true);
        } else {
            trackerInstance.close();
        }
    };

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
            onChange: handleToggle
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