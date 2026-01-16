// Main NimbleActionTracker application class
// Exports: NimbleActionTracker

export class NimbleActionTracker extends Application {
    combatActive = false;

    setCombatActive(active) {
        this.combatActive = active;
    }
    /**
     * Save the current position to localStorage
     */
    savePositionToLocalStorage() {
        try {
            const pos = this.position;
            if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
                localStorage.setItem('nimble-tracker-pos', JSON.stringify({ left: pos.left, top: pos.top }));
            }
        } catch (e) { console.warn('Nimble Tracker: Failed to save position', e); }
    }

    /**
     * Restore the last position from localStorage
     */
    restorePositionFromLocalStorage() {
        try {
            const raw = localStorage.getItem('nimble-tracker-pos');
            if (raw) {
                const pos = JSON.parse(raw);
                if (typeof pos.left === 'number' && typeof pos.top === 'number') {
                    this.position.left = pos.left;
                    this.position.top = pos.top;
                }
            }
        } catch (e) { console.warn('Nimble Tracker: Failed to restore position', e); }
    }
    // Allow players to open/close tracker at any time, but still force open on GM request
    render(force, options = {}) {
        // Only block if some future logic wants to restrict
        const rendered = super.render(force, options);
        // After rendering, restore position
        setTimeout(() => {
            this.restorePositionFromLocalStorage();
            if (this.position.left !== undefined && this.position.top !== undefined) {
                // Only set position if the element exists and is an HTMLElement
                const el = this.element?.[0];
                if (el instanceof HTMLElement) {
                    this.setPosition({ left: this.position.left, top: this.position.top });
                }
            }
        }, 0);
        return rendered;
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
        data.combatActive = isGM ? this.combatActive : undefined;

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
        // Save position on close or drag
        this.element.on('dragstop', () => this.savePositionToLocalStorage());
        this.element.on('close', () => this.savePositionToLocalStorage());

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

        // MANUAL READINESS INPUT (Player view only)
        html.find('.manual-readiness-input').on('change', async ev => {
            const input = ev.currentTarget;
            let value = parseInt(input.value);
            if (isNaN(value) || value < 1 || value > 30) {
                ui.notifications.warn("Please enter a number between 1 and 30.");
                input.value = '';
                return;
            }
            // Set readiness for the current player
            const actor = game.user.character;
            if (!actor) {
                ui.notifications.warn("No character assigned.");
                return;
            }
            // Use the same calculation as a normal initiative roll, but substitute the entered value for the dice roll
            // Find the rollCombatReadiness logic and adapt it here
            let readiness = "";
            let pips = [];
            // Example logic: (replace with your actual rollCombatReadiness logic if different)
            if (value >= 21) {
                readiness = "Vigilant";
                pips = [
                    { type: "inspired", active: true },
                    { type: "inspired", active: true },
                    { type: "neutral", active: true }
                ];
            } else if (value >= 11) {
                readiness = "Alert";
                pips = [
                    { type: "neutral", active: true },
                    { type: "neutral", active: true },
                    { type: "neutral", active: true }
                ];
            } else {
                readiness = "Hesitant";
                pips = [
                    { type: "bane", active: true },
                    { type: "bane", active: true },
                    { type: "neutral", active: true }
                ];
            }
            await actor.setFlag("nimble-action-tracker", "state", {
                readiness,
                pips
            });
            this.render();
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
            this.combatActive = true;
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
            this.combatActive = false;
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
        // Save position after drag
        this.element.on('dragstop', () => this.savePositionToLocalStorage());
    }

   async rollCombatReadiness(actor) {
        const row = document.querySelector(`[data-actor-id="${actor.id}"]`);
        const pipContainer = row?.querySelector('.pip-container');
        const loadingText = row?.querySelector('.loading-text');

        // 1. Map classes to witty phrases
        const classPhrases = {
            "Berserker": "Feeding inner fire...",
            "Cheat": "Stacking the deck...",
            "Commander": "Identifying weakness...",
            "Hunter": "Marking prey...",
            "Mage": "Incanting weave...",
            "Oathsworn": "Anchoring resolve...",
            "Shadowmancer": "Marshalling shadows...",
            "Shepherd": "Calling kin...",
            "Songweaver": "Seeking rhythm...",
            "Stormshifter": "Invoking elements...",
            "Zephyr": "Honing focus...",
            "Hexbinder": "Consulting with omens..."
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
