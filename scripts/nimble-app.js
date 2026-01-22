export class NimbleActionTracker extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
    combatActive = false;

    setCombatActive(active) {
        this.combatActive = active;
    }
    // Save the current position to localStorage
    savePositionToLocalStorage() {
        try {
            const pos = this.position;
            if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
                localStorage.setItem('nimble-tracker-pos', JSON.stringify({ left: pos.left, top: pos.top }));
            }
        } catch (e) { console.warn('Nimble Tracker: Failed to save position', e); }
    }

    // Restore the last position from localStorage
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
    constructor(options = {}) {
        super(options);
    }

    static DEFAULT_OPTIONS = {
        id: "nimble-action-tracker",
        classes: ["nimble-tracker-fancy"],
        tag: "div",
        window: {
            frame: true,
            positioned: true,
            resizable: false,
            minimizable: false,
            title: "Nimble Tracker"
        },
        position: {
            width: 300,
            height: "auto"
        }
    };

    static PARTS = {
        main: {
            template: "modules/nimble-action-tracker/templates/tracker.hbs"
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const isGM = game.user.isGM;
        const initiativeType = game.settings.get("nimble-action-tracker", "initiativeType");
        let data = { isGM, players: [], npcs: [], initiativeType };

        // Add combatActive flag for GM
        data.combatActive = isGM ? this.combatActive : undefined;

        // Restore saved order for GM
        let orderedActors;
        if (isGM) {
            const scene = game.scenes?.active;
            const savedOrder = scene?.getFlag("nimble-action-tracker", "playerOrder");
            const allActors = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
            if (Array.isArray(savedOrder) && savedOrder.length) {
                // Order actors by saved order, then append any missing
                orderedActors = savedOrder.map(id => allActors.find(a => a.id === id)).filter(Boolean);
                // Add any actors not in savedOrder
                const missing = allActors.filter(a => !savedOrder.includes(a.id));
                orderedActors = orderedActors.concat(missing);
            } else {
                orderedActors = allActors;
            }
            data.players = orderedActors.map(actor => {
                return {
                    id: actor.id,
                    name: actor.name,
                    ...this._getActorTrackerData(actor)
                };
            });

            // Add NPC tokens (non-hidden, non-character, not owned by player)
            data.npcs = canvas.tokens.placeables
                .filter(t => !t.document.hidden && t.actor?.type !== "character" && !t.actor?.hasPlayerOwner)
                .map(t => ({
                    tokenId: t.id,
                    name: t.name || t.actor?.name || "Unknown"
                }));
        } else {
            const actor = game.user.character;
            data.player = {
                id: actor?.id || "none",
                name: actor?.name || "No Character Assigned",
                ...this._getActorTrackerData(actor)
            };
        }
        return foundry.utils.mergeObject(context, data);
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

    _onRender(context, options) {
        super._onRender(context, options);

        // Restore position after render
        setTimeout(() => {
            this.restorePositionFromLocalStorage();
            if (this.position.left !== undefined && this.position.top !== undefined) {
                this.setPosition({ left: this.position.left, top: this.position.top });
            }
        }, 0);

        // Button event listeners (using data-action attributes)
        this.element.querySelectorAll('[data-action]').forEach(button => {
            button.addEventListener('click', this._onButtonClick.bind(this));
        });

        // Pip click listeners (can't use actions due to dynamic data-index)
        this.element.querySelectorAll('.pip').forEach(pip => {
            pip.addEventListener('click', this._onPipClick.bind(this));
        });

        // Manual readiness input
        const manualInput = this.element.querySelector('.manual-readiness-input');
        if (manualInput) {
            manualInput.addEventListener('change', this._onManualReadinessChange.bind(this));
        }

        // Drag-and-drop for GM player reorder
        if (game.user.isGM) {
            this._setupDragAndDrop();
        }

        // Hover effects for player and NPC names
        this._setupHoverEffects();

        // Make header/row draggable
        this._setupDraggable();
    }

    // Central button click handler that routes to specific action handlers
    async _onButtonClick(event) {
        const button = event.currentTarget;
        const action = button.dataset.action;

        if (!action) return;

        // Route to the appropriate handler
        switch(action) {
            case 'newRound':
                await this._onNewRound(event, button);
                break;
            case 'rollInit':
                await this._onRollInit(event, button);
                break;
            case 'requestInit':
                await this._onRequestInit(event, button);
                break;
            case 'endCombat':
                await this._onEndCombat(event, button);
                break;
            case 'fillPips':
                await this._onFillPips(event, button);
                break;
            case 'toggleTokenRing':
                await this._onToggleTokenRing(event, button);
                break;
            case 'toggleNpcRing':
                await this._onToggleNpcRing(event, button);
                break;
            case 'toggleDeadState':
                await this._onToggleDeadState(event, button);
                break;
        }
    }

    // Action handlers (instance methods for ApplicationV2)
    async _onNewRound(event, target) {
        if (!game.user.isGM) return;
        await this.colorAndPingTokensForNewRound();
    }

    async _onRollInit(event, target) {
        event.preventDefault();
        const row = target.closest('.player-row');
        const actorId = row?.dataset.actorId;
        const actor = game.actors.get(actorId) || game.user.character;

        if (actor) {
            await this.rollCombatReadiness(actor);
            if (game.user.isGM) {
                await this.colorAndPingTokensForNewRound();
            }
        } else {
            ui.notifications.warn("No character found to roll for.");
        }
    }

    async _onRequestInit(event, target) {
        if (!game.user.isGM) return;
        this.combatActive = true;
        this.render();
        // Set flag for all active player users to open tracker
        const playerUsers = game.users.filter(u => !u.isGM && u.active);
        for (const user of playerUsers) {
            await user.setFlag("nimble-action-tracker", "showTracker", true);
        }
        // Also highlight token rings for new round
        await this.colorAndPingTokensForNewRound();
    }

    async _onEndCombat(event, target) {
        if (!game.user.isGM) return;
        // Show confirmation dialog using foundry.applications.api.DialogV2
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "End Combat?" },
            content: `<div style='padding:1em;text-align:center;'>
                <div style='font-size:1.2em;margin-bottom:1em;'>Are you sure you want to end combat?</div>
            </div>`,
            rejectClose: false,
            modal: true
        });

        if (confirmed) {
            this.combatActive = false;
            this.render();
            const playerUsers = game.users.filter(u => !u.isGM && u.active);
            for (const user of playerUsers) {
                await user.setFlag("nimble-action-tracker", "showTracker", false);
            }
            // Reset all actors to default state (works for both initiative types)
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
            await this.resetAllTokenRings();
        }
    }

    async _onFillPips(event, target) {
        const actorId = target.closest('.player-row').dataset.actorId;
        const actor = game.actors.get(actorId);
        if (!actor) return;
        let state = JSON.parse(JSON.stringify(this._getActorTrackerData(actor)));
        state.pips = state.pips.map(p => {
            if (p && p.active && (p.type === "inspired" || p.type === "bane")) {
                return p;
            }
            return { type: "neutral", active: true };
        });
        await actor.setFlag("nimble-action-tracker", "state", state);
    }

    async _onToggleTokenRing(event, target) {
        const actorId = target.closest('.player-row').dataset.actorId;
        const actor = game.actors.get(actorId);
        if (!actor) return;
        const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
        if (!token) return;
        await this.ToggleTokenRing(token);
    }

    async _onToggleNpcRing(event, target) {
        const tokenId = target.closest('.npc-row').dataset.tokenId;
        const token = canvas.tokens.placeables.find(t => t.id === tokenId);
        if (!token) return;
        await this.ToggleTokenRing(token);
    }

    async _onToggleDeadState(event, target) {
        let token;
        let row = target.closest('.player-row');
        if (row && row.dataset.actorId) {
            token = canvas.tokens.placeables.find(t => t.actor?.id === row.dataset.actorId);
        } else {
            row = target.closest('.npc-row');
            if (row && row.dataset.tokenId) {
                token = canvas.tokens.placeables.find(t => t.id === row.dataset.tokenId);
            }
        }
        if (!token) {
            ui.notifications.warn("No token found for this row.");
            return;
        }
        const isDead = token.actor?.effects?.some(e => e.statuses?.has("dead"));
        await token.actor.toggleStatusEffect("dead", {overlay: true, active: !isDead});
        await token.document.update({
            alpha: isDead ? 1.0 : 0.5
        });
    }

    // Instance event handlers
    async _onPipClick(event) {
        const pip = event.currentTarget;
        const row = pip.closest('.player-row');
        const actorId = row.dataset.actorId;
        if (!actorId || actorId === "none") return;

        const actor = game.actors.get(actorId);
        const index = parseInt(pip.dataset.index);
        let state = JSON.parse(JSON.stringify(this._getActorTrackerData(actor)));
        const pipData = state.pips[index];

        if (pipData.active && !event.shiftKey && !event.ctrlKey) {
            pipData.active = false;
        } else {
            if (event.shiftKey) { pipData.type = "inspired"; pipData.active = true; }
            else if (event.ctrlKey) { pipData.type = "bane"; pipData.active = true; }
            else { pipData.type = "neutral"; pipData.active = true; }
        }
        await actor.setFlag("nimble-action-tracker", "state", state);
    }

    async _onManualReadinessChange(event) {
        const input = event.currentTarget;
        let value = parseInt(input.value);
        if (isNaN(value) || value < 1 || value > 30) {
            ui.notifications.warn("Please enter a number between 1 and 30.");
            input.value = '';
            return;
        }
        const actor = game.user.character;
        if (!actor) {
            ui.notifications.warn("No character assigned.");
            return;
        }

        const initiativeType = game.settings.get("nimble-action-tracker", "initiativeType");
        let readiness = "";
        let pips = [];

        if (initiativeType === "standard") {
            // Standard mode: Only neutral pips
            if (value >= 20) {
                pips = [
                    { type: "neutral", active: true },
                    { type: "neutral", active: true },
                    { type: "neutral", active: true }
                ];
            } else if (value >= 10) {
                pips = [
                    { type: "neutral", active: true },
                    { type: "neutral", active: true },
                    { type: "neutral", active: false }
                ];
            } else {
                pips = [
                    { type: "neutral", active: true },
                    { type: "neutral", active: false },
                    { type: "neutral", active: false }
                ];
            }
        } else {
            // Alternative mode: Current behavior with readiness statuses
            if (value >= 21) {
                readiness = "Vigilant";
                pips = [
                    { type: "inspired", active: true },
                    { type: "inspired", active: true },
                    { type: "neutral", active: true }
                ];
            } else if (value >= 11) {
                readiness = "Ready";
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
        }

        await actor.setFlag("nimble-action-tracker", "state", {
            readiness,
            pips
        });
        this.render();
    }

    _setupHoverEffects() {
        // Player rows (entire card)
        this.element.querySelectorAll('.player-row').forEach(row => {
            row.addEventListener('mouseenter', (ev) => {
                const actorId = ev.currentTarget.dataset.actorId;
                if (!actorId || actorId === "none") return;
                const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
                if (token) token._onHoverIn({});
            });
            row.addEventListener('mouseleave', (ev) => {
                const actorId = ev.currentTarget.dataset.actorId;
                if (!actorId || actorId === "none") return;
                const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
                if (token) token._onHoverOut({});
            });
        });

        // NPC rows (entire card)
        this.element.querySelectorAll('.npc-row').forEach(row => {
            row.addEventListener('mouseenter', (ev) => {
                const tokenId = ev.currentTarget.dataset.tokenId;
                if (!tokenId) return;
                const token = canvas.tokens.placeables.find(t => t.id === tokenId);
                if (token) token._onHoverIn({});
            });
            row.addEventListener('mouseleave', (ev) => {
                const tokenId = ev.currentTarget.dataset.tokenId;
                if (!tokenId) return;
                const token = canvas.tokens.placeables.find(t => t.id === tokenId);
                if (token) token._onHoverOut({});
            });
        });
    }

    _setupDragAndDrop() {
        let dragSrc = null;
        const playerRows = this.element.querySelectorAll('.player-row');
        const playerNames = this.element.querySelectorAll('.player-row .player-name');

        playerNames.forEach(nameEl => {
            nameEl.setAttribute('draggable', true);

            nameEl.addEventListener('dragstart', (ev) => {
                dragSrc = ev.target.closest('.player-row');
                ev.dataTransfer.effectAllowed = 'move';
                ev.dataTransfer.setData('text/plain', dragSrc.dataset.actorId);
                ev.target.classList.add('dragging');
            });

            nameEl.addEventListener('dragend', (ev) => {
                this.element.querySelectorAll('.player-name').forEach(el => {
                    el.classList.remove('dragging');
                });
                const currentOrder = Array.from(this.element.querySelectorAll('.player-row'))
                    .map(row => row.dataset.actorId);
                if (new Set(currentOrder).size !== currentOrder.length) {
                    this.render();
                }
            });
        });

        playerRows.forEach(row => {
            row.addEventListener('dragover', (ev) => {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'move';
                ev.currentTarget.classList.add('drag-over');
            });

            row.addEventListener('dragleave', (ev) => {
                ev.currentTarget.classList.remove('drag-over');
            });

            row.addEventListener('drop', async (ev) => {
                ev.preventDefault();
                this.element.querySelectorAll('.player-row').forEach(r => {
                    r.classList.remove('drag-over');
                });

                const targetRow = ev.currentTarget;
                const srcId = ev.dataTransfer.getData('text/plain');

                if (!srcId || targetRow.dataset.actorId === srcId) {
                    this.render();
                    return;
                }

                const srcElem = this.element.querySelector(`.player-row[data-actor-id="${srcId}"]`);
                if (srcElem && targetRow && srcElem !== targetRow) {
                    const allRows = Array.from(this.element.querySelectorAll('.player-row'));
                    const targetIndex = allRows.indexOf(targetRow);
                    const srcIndex = allRows.indexOf(srcElem);

                    if (targetIndex > srcIndex) {
                        targetRow.after(srcElem);
                    } else {
                        targetRow.before(srcElem);
                    }

                    const newOrder = Array.from(this.element.querySelectorAll('.player-row'))
                        .map(r => r.dataset.actorId);
                    const scene = game.scenes?.active;
                    if (scene) {
                        await scene.setFlag("nimble-action-tracker", "playerOrder", newOrder);
                    }
                } else {
                    this.render();
                }
            });
        });
    }

    _setupDraggable() {
        if (game.user.isGM) {
            const header = this.element.querySelector('.gm-header');
            if (header) new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
        } else {
            const playerRow = this.element.querySelector('.player-row .row-top');
            if (playerRow) new foundry.applications.ux.Draggable.implementation(this, this.element, playerRow, false);
        }
    }

    // Toggle the token ring for an individual token
    async ToggleTokenRing(token) {
        if (!token || token.document.hidden) return;
        const current = token.document.ring?.colors?.ring;
        if (current == null) {
            await this.colorAndPingTokenForNewRound(token);
        } else {
            await this.resetTokenRing(token);
        }
    }

    // Color and ping a single token as in colorAndPingTokensForNewRound
    async colorAndPingTokenForNewRound(token) {
        // Ignore tokens with the "Dead" status effect
        const hasDeadEffect = token.actor?.effects?.some(e => {
            return e.statuses?.has("dead") || e.getFlag("core", "statusId") === "dead" || e.label?.toLowerCase() === "dead";
        });
        if (hasDeadEffect) return;
        const brightGreen = "#00ff73";
        const bluePing = "#00BFFF";
        let ringColor;
        if (token.actor?.type === "character" && token.actor?.hasPlayerOwner) {
            ringColor = brightGreen;
        } else {
            const disp = token.document.disposition;
            const dispKey = Object.keys(CONST.TOKEN_DISPOSITIONS).find(k => CONST.TOKEN_DISPOSITIONS[k] === disp);
            ringColor = "#" + CONFIG.Canvas.dispositionColors[dispKey].toString(16).padStart(6, '0');
        }
        canvas.ping(token.center, {color: bluePing, style: "pulse"});
        await token.document.update({
            "ring.colors.ring": ringColor,
            "ring.effects": 2,
            "ring.enabled": true,
            "flags.world.zipperFinished": true
        });
    }

    // Reset a single token's ring as in resetAllTokenRings
    async resetTokenRing(token) {
        await token.document.update({
            "ring.colors.ring": null,
            "ring.effects": 0,
            "flags.world.zipperFinished": false
        });
    }

    // Roll combat readiness for an actor
    async rollCombatReadiness(actor) {
        const row = document.querySelector(`[data-actor-id="${actor.id}"]`);
        const pipContainer = row?.querySelector('.pip-container');
        const loadingText = row?.querySelector('.loading-text');

        // Map classes to witty phrases
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

        // Identify actor's class
        // Most systems store class name in actor.item types or a specific system field
        const actorClass = actor.items.find(i => i.type === "class")?.name || "Hero";
        const phrase = classPhrases[actorClass] || "Preparing for glory...";

        // Update UI and start loading
        if (loadingText) loadingText.innerText = phrase;
        if (pipContainer) pipContainer.classList.add('is-loading');

        // Perform the roll
        const dex = actor.system.abilities?.dexterity?.baseValue ?? 0;
        const roll = await new Roll(`1d20 + ${dex}`).evaluate();

        // Post to chat
        await roll.toMessage({
            flavor: `Initiative`,
            speaker: ChatMessage.getSpeaker({ actor })
        });

        // Delay after chat message only if Dice So Nice! is active
        const diceSoNiceActive = game.modules.get('dice-so-nice')?.active ?? false;
        if (diceSoNiceActive) {
            await new Promise(resolve => setTimeout(resolve, 3600));
        }

        // Calculate and set result based on initiative type
        let result = roll.total;
        let newState = { readiness: "", pips: [] };

        const initiativeType = game.settings.get("nimble-action-tracker", "initiativeType");

        if (initiativeType === "standard") {
            // Standard mode: Only neutral pips based on Nimble core rules
            // 1-9: 1 pip, 10-19: 2 pips, 20+: 3 pips
            if (result >= 20) {
                newState = {
                    readiness: "",
                    pips: [
                        {type: "neutral", active: true},
                        {type: "neutral", active: true},
                        {type: "neutral", active: true}
                    ]
                };
            } else if (result >= 10) {
                newState = {
                    readiness: "",
                    pips: [
                        {type: "neutral", active: true},
                        {type: "neutral", active: true},
                        {type: "neutral", active: false}
                    ]
                };
            } else {
                newState = {
                    readiness: "",
                    pips: [
                        {type: "neutral", active: true},
                        {type: "neutral", active: false},
                        {type: "neutral", active: false}
                    ]
                };
            }
        } else {
            // Alternative mode: Current behavior with readiness statuses
            if (result >= 20) {
                newState = { readiness: "Vigilant", pips: [{type: "inspired", active: true}, {type: "inspired", active: true}, {type: "neutral", active: true}] };
            } else if (result >= 10) {
                newState = { readiness: "Ready", pips: [{type: "neutral", active: true}, {type: "neutral", active: true}, {type: "neutral", active: true}] };
            } else {
                newState = { readiness: "Hesitant", pips: [{type: "bane", active: true}, {type: "bane", active: true}, {type: "neutral", active: true}] };
            }
        }

        await actor.setFlag("nimble-action-tracker", "state", newState);

        // UI resets automatically on re-render
        if (pipContainer) pipContainer.classList.remove('is-loading');
    }

    // Color and ping all non-hidden tokens in the scene based on disposition
    async colorAndPingTokensForNewRound() {
        const effectName = "Turn Taken";
        const bluePing = "#00BFFF";
        const brightGreen = "#00ff73";
        for (let token of canvas.tokens.placeables) {
            if (token.document.hidden) continue;
            // Ignore tokens with the "Dead" status effect
            const hasDeadEffect = token.actor?.effects?.some(e => {
                // Foundry v13: status effects use Set.has() not Array.includes()
                return e.statuses?.has("dead") || e.getFlag("core", "statusId") === "dead" || e.label?.toLowerCase() === "dead";
            });
            if (hasDeadEffect) continue;
            let ringColor;
            if (token.actor?.type === "character" && token.actor?.hasPlayerOwner) {
                ringColor = brightGreen;
            } else {
                const disp = token.document.disposition;
                const dispKey = Object.keys(CONST.TOKEN_DISPOSITIONS).find(k => CONST.TOKEN_DISPOSITIONS[k] === disp);
                ringColor = "#" + CONFIG.Canvas.dispositionColors[dispKey].toString(16).padStart(6, '0');
            }
            canvas.ping(token.center, {color: bluePing, style: "pulse"});
            await token.document.update({
                "ring.colors.ring": ringColor,
                "ring.effects": 2,
                "ring.enabled": true,
                "flags.world.zipperFinished": true
            });
        }
    }

    // Reset all non-hidden tokens in the scene to default ring state and clear flag
    async resetAllTokenRings() {
        for (let token of canvas.tokens.placeables) {
            if (token.document.hidden) continue;
            await token.document.update({ 
                "ring.colors.ring": null,
                "ring.effects": 0,
                "flags.world.zipperFinished": false
            });
        }
    }
}
