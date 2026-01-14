
console.log("[Nimble Tracker] Script loaded for user:", window?.game?.user?.id, "isGM:", window?.game?.user?.isGM);
let trackerInstance;

const TOOL_KEY = "nimble-tracker-toggle";
const TOOL_LABEL = "Toggle Nimble Action Tracker";
const TOOL_ICON = "fas fa-dice-d20";



let combatActive = false; // Module-level state for combat

// Helper: Only allow players to open tracker if combatActive
function canPlayerOpenTracker() {
    return game.user.isGM || combatActive;
}

class NimbleActionTracker extends Application {
    // Prevent players from opening tracker if not in combat, unless socket-triggered
    render(force, options = {}) {
        // Allow socket-triggered open (options.allowSocketOpen)
        if (!game.user.isGM && !combatActive && !options.allowSocketOpen) {
            ui.notifications.warn("You can only open the tracker during combat.");
            return;
        }
        return super.render(force, options);
    }
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

        // Add combatActive flag for GM
        data.combatActive = isGM ? combatActive : undefined;

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

        // DRAG-AND-DROP PLAYER REORDER (GM only)
        if (game.user.isGM) {
            let dragSrc = null;
            let originalOrder = [];
            // Save original order
            html.find('.player-row').each(function() {
                originalOrder.push(this.dataset.actorId);
            });
            html.find('.player-row .player-name').attr('draggable', true);
            html.find('.player-row .player-name').on('dragstart', function(ev) {
                dragSrc = $(this).closest('.player-row')[0];
                ev.originalEvent.dataTransfer.effectAllowed = 'move';
                ev.originalEvent.dataTransfer.setData('text/plain', dragSrc.dataset.actorId);
                $(this).addClass('dragging');
            });
            html.find('.player-row').on('dragover', function(ev) {
                ev.preventDefault();
                ev.originalEvent.dataTransfer.dropEffect = 'move';
                $(this).addClass('drag-over');
            });
            html.find('.player-row').on('dragleave', function(ev) {
                $(this).removeClass('drag-over');
            });
            html.find('.player-row').on('drop', (ev) => {
                ev.preventDefault();
                html.find('.player-row').removeClass('drag-over');
                const targetRow = ev.currentTarget;
                const srcId = ev.originalEvent.dataTransfer.getData('text/plain');
                if (!srcId || targetRow.dataset.actorId === srcId) {
                    this.render(); // Invalid drop, restore
                    return;
                }
                // Reorder DOM
                const srcElem = html.find(`.player-row[data-actor-id="${srcId}"]`)[0];
                if (srcElem && targetRow) {
                    if (srcElem !== targetRow) {
                        if ($(targetRow).index() > $(srcElem).index()) {
                            $(targetRow).after(srcElem);
                        } else {
                            $(targetRow).before(srcElem);
                        }
                    }
                } else {
                    this.render(); // Invalid drop, restore
                }
            });
            html.find('.player-row .player-name').on('dragend', (ev) => {
                html.find('.player-row .player-name').removeClass('dragging');
                // If order is invalid, restore
                const currentOrder = html.find('.player-row').map(function(){return this.dataset.actorId;}).get();
                if (new Set(currentOrder).size !== currentOrder.length) {
                    // Duplicates or missing, restore
                    this.render();
                }
            });
        }

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

        // REQUEST INITIATIVE (GM starts combat)
        html.find('.request-init').click(async () => {
            if (!game.user.isGM) return;
            combatActive = true;
            this.render();
            // Set flag for all active player users to open tracker
            const playerUsers = game.users.filter(u => !u.isGM && u.active);
            for (const user of playerUsers) {
                await user.setFlag("nimble-action-tracker", "showTracker", true);
            }
        });

        // END COMBAT (GM ends combat)
        html.find('.end-combat').click(async () => {
            if (!game.user.isGM) return;
            combatActive = false;
            this.render();
            // Set flag for all active player users to close tracker
            const playerUsers = game.users.filter(u => !u.isGM && u.active);
            for (const user of playerUsers) {
                await user.setFlag("nimble-action-tracker", "showTracker", false);
            }
            // Clear pips and readiness for all player actors
            for (const actor of game.actors.filter(a => a.type === "character" && a.hasPlayerOwner)) {
                await actor.setFlag("nimble-action-tracker", "state", {
                    readiness: "",
                    pips: [
                        { type: "neutral", active: false },
                        { type: "neutral", active: false },
                        { type: "neutral", active: false }
                    ]
                });
            }
        });

        // REFILL ROW
        html.find('.fill-row-pips').click(async ev => {
            const actorId = ev.currentTarget.closest('.player-row').dataset.actorId;
            const actor = game.actors.get(actorId);
            let state = JSON.parse(JSON.stringify(this._getActorTrackerData(actor)));
            state.pips = state.pips.map(p => ({ type: "neutral", active: true }));
            state.readiness = "";
            await actor.setFlag("nimble-action-tracker", "state", state);
        });

        // Make only the GM header or player name row draggable
        if (game.user.isGM) {
            const header = html.find('.gm-header')[0];
            if (header) new Draggable(this, html, header, false);
        } else {
            const playerRow = html.find('.player-row .row-top')[0];
            if (playerRow) new Draggable(this, html, playerRow, false);
        }
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
    // Instantiate the tracker application so it exists for later hooks
    trackerInstance = new NimbleActionTracker();
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
            trackerInstance.render(true, { allowSocketOpen: true });
        } else {
            combatActive = false;
            if (!trackerInstance) trackerInstance = new NimbleActionTracker();
            trackerInstance.close();
        }
    }
});

// Global initialization
Hooks.once('ready', () => {
    console.log("Nimble Tracker | Ready Hook firing.");

    const shouldShow = game.settings.get("nimble-action-tracker", "trackerVisible");
    if (shouldShow) {
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
        if (canPlayerOpenTracker()) {
            trackerInstance.render(true, {focus: true});
        } else {
            ui.notifications.warn("You can only open the tracker during combat.");
        }
    });
    $(html).find(".header-actions").append(button);
});

Hooks.on("updateActor", (actor, change) => {
    if (hasProperty(change, "flags.nimble-action-tracker") && trackerInstance) {
        trackerInstance.render(false);
    }
});



