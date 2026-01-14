
console.log("[Nimble Tracker] Script loaded for user:", window?.game?.user?.id, "isGM:", window?.game?.user?.isGM);
let trackerInstance;

const TOOL_KEY = "nimble-tracker-toggle";
const TOOL_LABEL = "Toggle Nimble Action Tracker";
const TOOL_ICON = "fas fa-dice-d20";


class NimbleActionTracker extends Application {
    constructor(options = {}) {
        super(options);
        console.log("Nimble Tracker | Application instance created.");
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "nimble-action-tracker",
            template: "modules/nimble-action-tracker/templates/tracker.hbs",
            popOut: true,
            width: 300,
            height: "auto",
            classes: ["nimble-tracker-fancy"], // Custom class for styling
            resizable: false,                  // No resizing
            minimizable: false                 // No minimizing
        });
    }

    getData() {
        console.log("Nimble Tracker | Gathering Data...");
        const isGM = game.user.isGM;
        let data = { isGM, players: [] };

        if (isGM) {
            data.players = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner).map(actor => {
                return {
                    id: actor.id,
                    name: actor.name,
                    ...this._getActorTrackerData(actor)
                };
            });
        } else {
            const actor = game.user.character;
            data.player = {
                id: actor?.id || "none",
                name: actor?.name || "No Character Assigned",
                ...this._getActorTrackerData(actor)
            };
        }
        console.log("Nimble Tracker | Data gathered:", data);
        return data;
    }

    _getActorTrackerData(actor) {
        const defaultState = {
            readiness: "Ready",
            pips: [
                { type: "neutral", active: false },
                { type: "neutral", active: false },
                { type: "neutral", active: false }
            ]
        };
        if (!actor) return defaultState;
        return actor.getFlag("nimble-action-tracker", "state") || defaultState;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // PIP CLICKS
        html.find('.pip').click(async ev => {
            const row = ev.currentTarget.closest('.player-row');
            const actorId = row.dataset.actorId;
            if (!actorId || actorId === "none") return;

            const actor = game.actors.get(actorId);
            const index = parseInt(ev.currentTarget.dataset.index);
            let state = JSON.parse(JSON.stringify(this._getActorTrackerData(actor)));
            const pip = state.pips[index];

            if (pip.active && !ev.shiftKey && !ev.ctrlKey) {
                pip.active = false;
            } else {
                if (ev.shiftKey) { pip.type = "inspired"; pip.active = true; }
                else if (ev.ctrlKey) { pip.type = "bane"; pip.active = true; }
                else { pip.type = "neutral"; pip.active = true; }
            }
            await actor.setFlag("nimble-action-tracker", "state", state);
        });

        // ROLL INITIATIVE (The Fix)
        html.find('.roll-init').click(async (ev) => { 
            ev.preventDefault();
            // Look for ID in the row, otherwise fallback to the user's character
            const row = ev.currentTarget.closest('.player-row');
            const actorId = row ? row.dataset.actorId : null;
            const actor = game.actors.get(actorId) || game.user.character;

            if (actor) {
                await this.rollCombatReadiness(actor);
            } else {
                ui.notifications.warn("No character found to roll for.");
            }
        });

        // REQUEST INITIATIVE
        html.find('.request-init').click(() => {
            game.socket.emit("module.nimble-action-tracker", { action: "promptRoll" });
            ui.notifications.info("Requested initiative from players.");
        });

        // REFILL ROW
        html.find('.fill-row-pips').click(async ev => {
            const actorId = ev.currentTarget.closest('.player-row').dataset.actorId;
            const actor = game.actors.get(actorId);
            let state = JSON.parse(JSON.stringify(this._getActorTrackerData(actor)));
            state.pips = state.pips.map(p => ({ type: "neutral", active: true }));
            await actor.setFlag("nimble-action-tracker", "state", state);
        });

        new Draggable(this, html, html.parent()[0], false);
    }

   async rollCombatReadiness(actor) {
        const row = document.querySelector(`[data-actor-id="${actor.id}"]`);
        const pipContainer = row?.querySelector('.pip-container');
        const loadingText = row?.querySelector('.loading-text');

        // 1. Map classes to witty phrases
        const classPhrases = {
            "Berserker": "Feeding the inner fire...",
            "Cheat": "Stacking the deck...",
            "Commander": "Surveying the battlefield...",
            "Hunter": "Finding the perfect opening...",
            "Mage": "Incanting the weave...",
            "Oathsworn": "Hardening the resolve...",
            "Shadowmancer": "Coaxing the darkness...",
            "Shepherd": "Tending the flock...",
            "Songweaver": "Tuning the strings...",
            "Stormshifter": "Testing the winds...",
            "Zephyr": "Focusing the breath..."
        };

        // 2. Identify Actor's Class (Assuming Nimble v2 data structure)
        // Most systems store class name in actor.item types or a specific system field
        const actorClass = actor.items.find(i => i.type === "class")?.name || "Hero";
        const phrase = classPhrases[actorClass] || "Preparing for glory...";

        // 3. Update UI and Start Loading
        if (loadingText) loadingText.innerText = phrase;
        if (pipContainer) pipContainer.classList.add('is-loading');

        // 4. Perform the Roll
        const dex = actor.system.abilities?.dexterity?.baseValue ?? 0;
        const roll = await new Roll(`1d20 + ${dex}`).evaluate();
        
        // 5. Blizzard-style Delay (1.2 seconds)
        await new Promise(resolve => setTimeout(resolve, 1200));

        // 6. Post to Chat
        await roll.toMessage({ 
            flavor: `Initiative`,
            speaker: ChatMessage.getSpeaker({ actor })
        });

        // 7. Calculate and Set Result
        let result = roll.total;
        let newState = { readiness: "", pips: [] };

        if (result >= 20) {
            newState = { readiness: "Vigilant", pips: [{type: "inspired", active: true}, {type: "inspired", active: true}, {type: "neutral", active: true}] };
        } else if (result >= 10) {
            newState = { readiness: "Alert", pips: [{type: "neutral", active: true}, {type: "neutral", active: true}, {type: "neutral", active: true}] };
        } else {
            newState = { readiness: "Hesitant", pips: [{type: "bane", active: true}, {type: "bane", active: true}, {type: "neutral", active: true}] };
        }

        await actor.setFlag("nimble-action-tracker", "state", newState);
        
        // UI resets automatically on re-render, but for safety:
        if (pipContainer) pipContainer.classList.remove('is-loading');
    }
}

Hooks.once('init', () => {
    // Register client setting for persistence
    game.settings.register("nimble-action-tracker", "trackerVisible", {
        scope: "client",
        config: false,
        type: Boolean,
        default: false
    });

});

// Global initialization
Hooks.once('ready', () => {
    console.log("Nimble Tracker | Ready Hook firing.");

    const shouldShow = game.settings.get("nimble-action-tracker", "trackerVisible");
    if (shouldShow) {
        trackerInstance.render(true);
    }

    console.log("[Nimble Tracker] Registering socket listener for user:", game.user.id, "isGM:", game.user.isGM);
    game.socket.on("module.nimble-action-tracker", data => {
        console.log("[Nimble Tracker] Socket event received:", data, "User:", game.user.id, "Character:", game.user.character);
        if (data.action === "promptRoll") {
            if (game.user.isGM) {
                console.log("[Nimble Tracker] GM received promptRoll, ignoring dialog.");
                return;
            }
            if (!game.user.character) {
                ui.notifications.warn("You do not have a character assigned. Initiative roll request ignored.");
                console.warn("[Nimble Tracker] No character assigned to user:", game.user.id);
                return;
            }
            console.log("[Nimble Tracker] Showing initiative dialog to user:", game.user.id);
            new Dialog({
                title: "Nimble Initiative",
                content: "GM requests Combat Readiness roll!",
                buttons: { roll: { label: "Roll", callback: () => trackerInstance.rollCombatReadiness(game.user.character) } }
            }).render(true);
        }
    });
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

        // Define the tool based on your toggle needs
        const tool = { 
            name: TOOL_KEY, 
            title: TOOL_LABEL, 
            icon: TOOL_ICON, 
            toggle: true, // This makes the button stay highlighted when active
            active: game.settings.get("nimble-action-tracker", "trackerVisible"),
            onClick: (active) => {
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
            }
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
Hooks.on("renderActorDirectory", (app, html) => {
    const button = $(`<button class="nimble-btn"><i class="fas fa-dice-d20"></i> Action Tracker</button>`);
    button.click(() => {
        console.log("Nimble Tracker | Manual open clicked.");
        trackerInstance.render(true, {focus: true});
    });
    $(html).find(".header-actions").append(button);
});

Hooks.on("updateActor", (actor, change) => {
    if (hasProperty(change, "flags.nimble-action-tracker") && trackerInstance) {
        trackerInstance.render(false);
    }
});



