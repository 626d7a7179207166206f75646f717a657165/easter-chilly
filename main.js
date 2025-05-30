/*
    Copyright (c) 2023-2025 Oliver Lau

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/


(function (window) {
    "use strict";

    const DEBUG = true;

    class Constraint {
        static Edge = "edge-constraint";
        static Node = "node-constraint";
    }

    class Tile {
        static Size = 32;
        static Empty = ' ';
        static Ice = ' ';
        static Marker = '.';
        static Rock = '#';
        static Flower = 'Y';
        static Tree = 'T';
        static Exit = 'X';
        static Player = 'P';
        static Coin = '$';
        static Gold = 'G';
        static Hole = 'O';
    };

    class Tiles {
        static PenguinUpright = 'penguin-standing-easter';
        static PenguinLeft = 'penguin-left-easter';
        static PenguinRight = 'penguin-right-easter';
        static PenguinUp = 'penguin-up-easter';
        static PenguinDown = 'penguin-down-easter';
    }

    class State {
        static PreInit = -1;
        static SplashScreen = 0;
        static Playing = 1;
        static LevelEnd = 2;
        static GameEnd = 3;
        static LevelSelectionScreen = 4;
        static ProgressScreen = 5;
        static Autoplay = 6;
    }

    class StorageKey {
        static LevelNum = 'easter-chilly.level';
        static MaxLevelNum = 'easter-chilly.max-level';
        static SoundEnabled = 'easter-chilly.sound-enabled';
        static Constraint = 'easter-chilly.constraint';
        static Path = 'easter-chilly.path';
    }

    let LEVELS;
    const DeceleratingEasing = bezier(.34, .87, 1, 1);
    const el = {};
    let player = {
        x: 0,
        y: 0,
        world: { x: 0, y: 0 },
        dest: { x: 0, y: 0 },
        el: null,
        moves: [],
    };
    let autoplayIdx = 0;
    let autoplayMoves = '';
    let visited = new Set();
    let level = {
        origData: [],
        connections: [],
        data: [],
        width: 0,
        height: 0,
        cellAt: function (x, y) {
            return level.data[(y + level.height) % level.height][(x + level.width) % level.width];
        },
        currentIdx: 0,
        collectibles: {},
        tiles: [[]],
    };
    let world = { width: 0, height: 0 };
    let viewPort = { x: 0, y: 0, width: 0, height: 0 };
    let state = State.PreInit;
    let prevState;
    let t0, t1, animationDuration;
    let isMoving = false;
    let exitReached = false;
    let holeEntered = false;
    let easing = DeceleratingEasing;
    let sounds = {};
    let audioCtx;
    let gainNode;
    let soundEnabled;

    function squared(x) {
        return x * x;
    }

    function linear(x) {
        return x;
    }

    function placePlayerOnPixel(x, y) {
        player.world.x = Tile.Size * x;
        player.world.y = Tile.Size * y;
        player.el.style.left = `${player.world.x}px`;
        player.el.style.top = `${player.world.y}px`;
        scrollIntoView();
    }

    function placePlayerOnTile(x, y) {
        player.x = (x + level.width) % level.width;
        player.y = (y + level.height) % level.height;
        placePlayerOnPixel(player.x, player.y);
    }

    function placePlayerAt(x, y) {
        player.x = (x + level.width) % level.width;
        player.y = (y + level.height) % level.height;
        player.el.style.left = `${Tile.Size * player.x}px`;
        player.el.style.top = `${Tile.Size * player.y + 1}px`;
    }

    function onResize(e) {
        const GameElPadding = 5;
        viewPort = el.game.getBoundingClientRect();
        viewPort.width -= 2 * GameElPadding;
        viewPort.height -= 2 * GameElPadding;
        el.extraStyles.textContent = `:root {
            --game-width: ${viewPort.width}px;
        }`;
        scrollIntoView();
    }

    function scrollIntoView() {
        el.game.scrollTo({
            left: player.world.x - viewPort.width / 2,
            top: player.world.y - viewPort.height / 2,
            behavior: 'auto',
        });
    }

    function standUpright() {
        player.el.classList.remove(Tiles.PenguinLeft, Tiles.PenguinRight, Tiles.PenguinUp, Tiles.PenguinDown);
    }

    function teleport() {
        playSound("teleport");
        const connection = level.connections.find(conn => conn.src.x === player.x && conn.src.y === player.y);
        player.dest = { ...connection.dst };
        const angle = Math.atan2(player.dest.y - player.y, player.dest.x - player.x);
        player.el.classList.replace(Tiles.PenguinUpright, 'penguin-submerged')
        player.el.classList.add('submerged');
        player.el.style.transform = `rotate(${angle + Math.PI / 2}rad)`;
        standUpright();
        const dist = Math.sqrt(squared(player.x - player.dest.x) + squared(player.y - player.dest.y));
        const animationDurationFactor = (state === State.Autoplay ? 55 : 133);
        animationDuration = animationDurationFactor * dist;
        t0 = performance.now();
        t1 = t0 + animationDuration;
        isMoving = true;
        easing = linear;
        animateDive();
    }

    function animateDive() {
        const dt = performance.now() - t0;
        const f = easing(dt / animationDuration);
        const dx = f * (player.dest.x - player.x);
        const dy = f * (player.dest.y - player.y);
        player.world.x = Tile.Size * (player.x + dx);
        player.world.y = Tile.Size * (player.y + dy);
        player.el.style.left = `${player.world.x}px`;
        player.el.style.top = `${player.world.y}px`;
        scrollIntoView();
        if (performance.now() > t1) {
            placePlayerOnTile(player.dest.x, player.dest.y);
            player.el.classList.replace('penguin-submerged', Tiles.PenguinUpright)
            player.el.classList.remove('submerged');
            player.el.style.transform = 'rotate(0rad)';
            isMoving = false;
            checkAutoplay();
        }
        else {
            requestAnimationFrame(animateDive);
        }
    }

    function rockHit() {
        playSound("rock");
        standUpright();
        checkAutoplay();
    }

    function checkEdge(x0, y0, x1, y1) {
        if (state === State.Autoplay)
            return;
        const key = `${x0},${y0} ➞ ${x1},${y1}`;
        console.debug(`Checking edge ${key}`);
        if (visited.has(key)) {
            el.invalidMoveDialog.dataset.constraint = el.constraint.value;
            el.invalidMoveDialog.showModal();
            return false;
        }
        visited.add(key);
        return true;
    }

    function checkNode(x, y) {
        if (state === State.Autoplay)
            return;
        const key = `${x},${y}`;
        console.debug(`Checking node ${key}`);
        if (visited.has(key)) {
            el.invalidMoveDialog.dataset.constraint = el.constraint.value;
            el.invalidMoveDialog.showModal();
            return false;
        }
        visited.add(key);
        return true;
    }

    function getDestNode() {
        let dstx, dsty;
        if (holeEntered) {
            let dstx = (player.dest.x + level.width) % level.width;
            let dsty = (player.dest.y + level.height) % level.height;
            const connection = level.connections.find(conn => conn.src.x === dstx && conn.src.y === dsty);
            dstx = connection.dst.x;
            dsty = connection.dst.y;
        }
        else {
            dstx = player.dest.x;
            dsty = player.dest.y;
        }
        return { dstx, dsty };
    }

    function checkAutoplay() {
        if (state !== State.Autoplay)
            return;
        if (autoplayIdx < autoplayMoves.length) {
            const direction = autoplayMoves[autoplayIdx];
            ++autoplayIdx;
            const { x, y } = player;
            moveTo(direction);
            // detect fake moves
            if (x === player.dest.x && y === player.dest.y) {
                setState(State.LevelEnd);
                setTimeout(() => {
                    alert(`Ungültiger Zug ${direction} nach ${x},${y} bei ${autoplayMoves.substring(0, autoplayIdx - 1)}`);
                }, 50);
                return;
            }
            switch (el.constraint.value) {
                case Constraint.Edge:
                    {
                        const { dstx, dsty } = getDestNode();
                        const edge_key = `${x},${y} ➞ ${dstx},${dsty}`;
                        console.debug(`Checking edge ${edge_key}`);
                        if (visited.has(edge_key)) {
                            setState(State.LevelEnd);
                            setTimeout(() => {
                                alert(`Ungültiger Zug! Kante ${edge_key} zum zweiten Mal besucht bei ${autoplayMoves.substring(0, autoplayIdx - 1)}`);
                            }, 50);
                            return;
                        }
                        visited.add(edge_key);
                    }
                    break;
                case Constraint.Node:
                    {
                        const { dstx, dsty } = getDestNode();
                        const node_key = `${dstx},${dsty}`;
                        console.debug(`Checking node ${node_key}`);
                        if (visited.has(node_key)) {
                            console.debug(`Bad node ${node_key}`);
                            el.invalidMoveDialog.dataset.constraint = el.constraint.value;
                            el.invalidMoveDialog.showModal();
                            return false;
                        }
                        visited.add(node_key);
                    }
                    break;
                default:
                    console.error('No constraint selected');
                    break;
            }
        }
        else {
            setState(State.Playing);
        }
    }

    function updateMoveCounter() {
        el.moveCount.title = player.moves.join('');
        el.moveCount.textContent = player.moves.length;
    }

    function animateRegularMove() {
        const dt = performance.now() - t0;
        const f = easing(dt / animationDuration);
        const dx = f * (player.dest.x - player.x);
        const dy = f * (player.dest.y - player.y);
        const x = (player.x + Math.round(dx) + level.width) % level.width;
        const y = (player.y + Math.round(dy) + level.height) % level.height;
        if (level.data[y][x] === Tile.Coin) {
            level.tiles[y][x].classList.replace('egg', 'ice');
            delete level.collectibles[`${x},${y}`];
            level.data[y] = level.data[y].substring(0, x) + Tile.Ice + level.data[y].substring(x + 1);
            playSound("coin");
        }
        player.world.x = Tile.Size * ((player.x + dx + level.width) % level.width);
        player.world.y = Tile.Size * ((player.y + dy + level.height) % level.height);
        if (player.world.x < 0 || player.world.y < 0 || player.world.x > world.width - Tile.Size || player.world.y > world.height - Tile.Size) {
            player.el.classList.add('hidden');
        }
        else {
            player.el.classList.remove('hidden');
        }
        player.el.style.left = `${player.world.x}px`;
        player.el.style.top = `${player.world.y}px`;
        scrollIntoView();
        if (performance.now() > t1) {
            placePlayerOnTile(player.dest.x, player.dest.y);
            updateMoveCounter();
            isMoving = false;
            if (exitReached) {
                onExitReached();
            }
            else if (holeEntered) {
                teleport();
            }
            else {
                rockHit();
            }
        }
        else {
            requestAnimationFrame(animateRegularMove);
        }
    }

    function move(dx, dy) {
        if (isMoving || exitReached)
            return false;
        let hasMoved = false;
        let { x, y } = player;
        const orig = { x, y };
        let xStep = 0;
        let yStep = 0;
        while ([Tile.Ice, Tile.Coin, Tile.Gold, Tile.Marker, Tile.Empty].includes(level.cellAt(x + dx, y + dy))) {
            x += dx;
            y += dy;
            xStep += dx;
            yStep += dy;
        }
        exitReached = level.cellAt(x + dx, y + dy) === Tile.Exit;
        holeEntered = level.cellAt(x + dx, y + dy) === Tile.Hole;
        let dist = Math.abs(xStep) + Math.abs(yStep);
        if (xStep > 0) {
            player.el.classList.add(Tiles.PenguinRight);
            hasMoved = true;
        }
        else if (xStep < 0) {
            player.el.classList.add(Tiles.PenguinLeft);
            hasMoved = true;
        }
        else if (yStep < 0) {
            player.el.classList.add(Tiles.PenguinUp);
            hasMoved = true;
        }
        else if (yStep > 0) {
            player.el.classList.add(Tiles.PenguinDown);
            hasMoved = true;
        }
        else if (exitReached || holeEntered) {
            hasMoved = true;
            dist += 1;
        }
        if (dist > 0) {
            isMoving = true;
            if (exitReached || holeEntered) {
                player.dest = { x: x + dx, y: y + dy };
            }
            else {
                player.dest = { x, y };
            }
            switch (el.constraint.value) {
                case Constraint.Edge:
                    if (holeEntered) {
                        const dstx = (player.dest.x + level.width) % level.width;
                        const dsty = (player.dest.y + level.height) % level.height;
                        const connection = level.connections.find(conn => conn.src.x === dstx && conn.src.y === dsty);
                        checkEdge(orig.x, orig.y, dstx, dsty);
                    } else {
                        checkEdge(orig.x, orig.y, player.dest.x, player.dest.y);
                    }
                    break;
                case Constraint.Node:
                    const dstx = (player.dest.x + level.width) % level.width;
                    const dsty = (player.dest.y + level.height) % level.height;
                    checkNode(dstx, dsty);
                    break;
                default:
                    console.warn('No constraint selected');
                    break;
            }
            const animationDurationFactor = (state === State.Autoplay ? 66 : 100);
            animationDuration = animationDurationFactor * dist;
            t0 = performance.now();
            t1 = t0 + animationDuration;
            easing = DeceleratingEasing;
            animateRegularMove();
        }
        return hasMoved;
    }

    function moveUp() {
        return move(0, -1);
    }

    function moveDown() {
        return move(0, +1);
    }

    function moveLeft() {
        return move(-1, 0);
    }

    function moveRight() {
        return move(+1, 0);
    }

    function moveTo(direction) {
        switch (direction.toUpperCase()) {
            case 'U':
                moveUp();
                break;
            case 'D':
                moveDown();
                break;
            case 'L':
                moveLeft();
                break;
            case 'R':
                moveRight();
                break;
        }
    }

    function onKeyPressed(e) {
        if (!DEBUG && !isMoving && (e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            e.stopPropagation();
            resetLevel();
            return false;
        }
        switch (state) {
            case State.GameEnd:
                if (e.type === 'keypress') {
                    if (e.key === 'r') {
                        el.congratsDialog.close();
                        replayLevel();
                    }
                    e.preventDefault();
                }
                break;
            case State.LevelEnd:
                if (e.type === 'keypress') {
                    if (e.key === ' ') {
                        el.congratsDialog.close();
                        gotoNextLevel();
                    }
                    else if (e.key === 'r') {
                        el.congratsDialog.close();
                        replayLevel();
                    }
                    e.preventDefault();
                }
                break;
            case State.LevelSelectionScreen:
                if (e.type === 'keydown' && e.key === 'Escape') {
                    el.levelSelectionDialog.close();
                    restoreState();
                    e.preventDefault();
                    return;
                }
                break;
            case State.SplashScreen:
                if (e.type === 'keypress' && e.key === ' ') {
                    el.splashDialog.close();
                    e.preventDefault();
                    play();
                }
                break;
            case State.Playing:
            // fall-through
            case State.Autoplay:
                if (isMoving)
                    return;
                let move;
                let hasMoved = false;
                switch (e.key) {
                    case 'w':
                    // fall-through
                    case 'ArrowUp':
                        hasMoved = moveUp();
                        move = 'U';
                        break;
                    case 'a':
                    // fall-through
                    case 'ArrowLeft':
                        hasMoved = moveLeft();
                        move = 'L';
                        break;
                    case 's':
                    // fall-through
                    case 'ArrowDown':
                        hasMoved = moveDown();
                        move = 'D';
                        break;
                    case 'd':
                    // fall-through
                    case 'ArrowRight':
                        hasMoved = moveRight();
                        move = 'R';
                        break;
                }
                if (hasMoved) {
                    player.moves.push(move);
                    el.path.value = player.moves.join('');
                }
                break;
            default:
                if (e.type === 'keydown' && e.key === 'Escape') {
                    if (state != State.SplashScreen) {
                        showLevelSelectionScreen();
                    }
                    e.preventDefault();
                    return;
                }
                break;
        }
    }

    function onClick(e) {
        const dx = (e.target.offsetLeft / Tile.Size) - player.x;
        const dy = (e.target.offsetTop / Tile.Size) - player.y;
        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0) {
                window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 'd' }));
            }
            else {
                window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 'a' }));
            }
        }
        else {
            if (dy > 0) {
                window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 's' }));
            }
            else {
                window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 'w' }));
            }
        }
        checkAudio();
    }

    function generateScene() {
        const scene = document.createElement('div');
        scene.style.gridTemplateColumns = `repeat(${level.width}, ${Tile.Size}px)`;
        scene.style.gridTemplateRows = `repeat(${level.height}, ${Tile.Size}px)`;
        level.tiles = [];
        level.collectibles = {};
        for (let y = 0; y < level.data.length; ++y) {
            const row = level.data[y];
            level.tiles.push([]);
            for (let x = 0; x < row.length; ++x) {
                const item = row[x];
                const tile = document.createElement('span');
                tile.className = 'tile';
                switch (item) {
                    case Tile.Rock:
                        tile.classList.add('rock');
                        break;
                    case Tile.Empty:
                        tile.classList.add('empty');
                        break;
                    case Tile.Coin:
                        tile.classList.add('egg');
                        level.collectibles[`${x},${y}`] = item;
                        break;
                    case Tile.Gold:
                        tile.classList.add('gold');
                        level.collectibles[`${x},${y}`] = item;
                        break;
                    case Tile.Flower:
                        tile.classList.add('flower');
                        break;
                    case Tile.Tree:
                        tile.classList.add('tree');
                        break;
                    case Tile.Exit:
                        tile.classList.add('exit');
                        break;
                    case Tile.Hole:
                        tile.classList.add('hole');
                        break;
                    case Tile.Player:
                        placePlayerAt(x, y);
                    // fall-through
                    case Tile.Ice:
                    default:
                        tile.classList.add('ice');
                        break;
                }
                scene.appendChild(tile);
                level.tiles[y].push(tile);
            }
        }
        return scene;
    }

    function replacePlayerWithIceTile() {
        level.data[player.y] = level.data[player.y].substring(0, player.x) + Tile.Ice + level.data[player.y].substring(player.x + 1);
    }

    function doPlaySound(name) {
        // According to https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode,
        // an `AudioBufferSourceNode` can only be played once; after each call to `start()`,
        // you have to create a new `AudioBufferSourceNode` if you want to play the same sound
        // again.
        const source = audioCtx.createBufferSource();
        sounds[name].source = source;
        source.buffer = sounds[name].buffer;
        source.connect(gainNode);
        source.start();
    }

    function playSound(name) {
        if (!soundEnabled)
            return;
        if (audioCtx.state === "suspended") {
            resumeAudio().then(() => {
                doPlaySound(name);
            });
        }
        else {
            doPlaySound(name);
        }
    }

    function getNumStars() {
        const numMoves = state === State.Autoplay ? autoplayMoves.length : player.moves.length;
        // Make sure the thresholds are in proper order
        const sortedThresholds = [...LEVELS[level.currentIdx].thresholds].sort((a, b) => b - a);
        const thresholdIndex = sortedThresholds.findIndex(threshold => numMoves >= threshold);
        const numStars = thresholdIndex === -1 ? 0 : 3 - thresholdIndex;
        return numStars;
    }

    function onExitReached() {
        playSound("exit");
        standUpright();
        if (state !== State.Autoplay) {
            console.info(`Level completed in ${player.moves.length} moves: ${player.moves.join('')}`);
        }
        el.congratsDialog.querySelectorAll("[data-command]").forEach(el => el.classList.remove('hidden'));
        el.congratsDialog.querySelector('div.pulsating>span').textContent = level.currentIdx + 1 + 1;
        const stars = el.congratsDialog.querySelectorAll('.stars>span');
        stars.forEach(star => star.classList.replace('star', 'star-pale'));
        const numStars = getNumStars();
        for (let i = 0; i < numStars; ++i) {
            stars[i].classList.replace('star-pale', 'star');
            stars[i].classList.add('pulse')
            if (i > 0) {
                stars[i].classList.add(`pulse${i}`);
            }
        }
        const eggsLeft = Object.values(level.collectibles).some(item => item === Tile.Coin);
        if (!eggsLeft) {
            el.congratsDialog.querySelector('[data-eggs-left]').classList.add('hidden');
        }
        else {
            el.congratsDialog.querySelector('[data-eggs-left]').classList.remove('hidden');
        }
        el.congratsDialog.querySelector('h2').textContent = (function (numStars) {
            switch (numStars) {
                case 3:
                    return "Perfekt!";
                case 2:
                    return "Sehr gut, aber noch nicht perfekt!";
                case 1:
                    return "Gut gemacht, aber es gibt noch Potenzial!";
                default:
                    const poorMessages = [
                        "Da geht noch so einiges …",
                        "Das kannst du besser!",
                        "Ein gutes Stück entfernt vom Optimum.",
                        "Übung macht den Meister!",
                        "Nicht aufgeben, weiter probieren!",
                    ];
                    return poorMessages[Math.floor(Math.random() * poorMessages.length)];
            }
        })(numStars);
        el.proceed = el.congratsDialog.querySelector('[data-command="proceed"]');
        if (level.currentIdx + 1 < LEVELS.length) {
            el.congratsDialog.querySelector('[data-command="restart"]').classList.add('hidden');
            el.proceed.addEventListener('click', () => {
                el.congratsDialog.close();
                gotoNextLevel();
            }, { capture: true, once: true });
        }
        else {
            el.proceed.classList.add('hidden');
            setState(State.GameEnd);
        }
        el.replay = el.congratsDialog.querySelector('[data-command="replay"]');
        el.replay.addEventListener('click', () => {
            el.congratsDialog.close();
            replayLevel();
        }, { capture: true, once: true });
        t0 = performance.now();
        setState(State.LevelEnd);
        el.congratsDialog.showModal();
    }

    function setLevel(levelData) {
        level.data = [...levelData.data];
        level.connections = levelData.connections;
        level.origData = [...levelData.data];
        level.width = level.data[0].length;
        level.height = level.data.length;
        world.width = Tile.Size * level.width;
        world.height = Tile.Size * level.height;
        if (level.connections instanceof Array) {
            for (const conn of level.connections) {
                console.assert(level.cellAt(conn.src.x, conn.src.y) === Tile.Hole);
                console.assert(level.cellAt(conn.dst.x, conn.dst.y) === Tile.Hole);
            }
        }
        el.levelNum.textContent = `Level ${level.currentIdx + 1}`;
        player.moves = [];
        updateMoveCounter();
        el.scene = generateScene();
        el.game.replaceChildren(el.scene, player.el);
        replacePlayerWithIceTile();
        onResize();
    }

    function restoreState() {
        state = prevState;
    }

    function setState(newState) {
        prevState = state;
        state = newState;
    }

    function autoplay() {
        if (el.path.value.length === 0)
            return;
        player.moves = [];
        restartGame();
        autoplayIdx = 0;
        autoplayMoves = el.path.value;
        setState(State.Autoplay);
        checkAutoplay();
    }

    function play() {
        setState(State.Playing);
        visited.clear();
        checkAudio();
    }

    function replayLevel() {
        el.replay.addEventListener('click', replayLevel, { capture: true, once: true });
        resetLevel();
        play();
    }

    function maxLevelNum() {
        let maxLvl = parseInt(localStorage.getItem(StorageKey.MaxLevelNum));
        if (isNaN(maxLvl)) {
            maxLvl = 0;
        }
        maxLvl = Math.max(level.currentIdx, Math.min(LEVELS.length, maxLvl));
        return maxLvl;
    }

    function gotoLevel(idx) {
        level.currentIdx = idx;
        localStorage.setItem(StorageKey.LevelNum, level.currentIdx);
        resetLevel();
        play();
    }

    function gotoNextLevel() {
        el.proceed.removeEventListener('click', gotoNextLevel);
        ++level.currentIdx;
        localStorage.setItem(StorageKey.LevelNum, level.currentIdx);
        localStorage.setItem(StorageKey.MaxLevelNum, maxLevelNum() + 1);
        resetLevel();
        play();
    }

    function showSplashScreen() {
        setState(State.SplashScreen);
        el.splashDialog.showModal();
        el.splashDialog.addEventListener('click', () => {
            el.splashDialog.close();
            play();
        }, { capture: true, once: true });
    }

    function showLevelSelectionScreen() {
        setState(State.LevelSelectionScreen);
        el.levelSelectionDialog.showModal();
        const lvlList = el.levelSelectionDialog.querySelector('.level-list');
        const container = document.createElement('div');
        for (const [i, level] of Object.entries(LEVELS)) {
            const lvlName = level.name || '<?>';
            const div = document.createElement('div');
            div.textContent = `Level ${parseInt(i) + 1}: ${lvlName}`;
            div.dataset.levelIdx = i;
            div.addEventListener('click', e => {
                switch (level.constraint) {
                    case Constraint.Edge:
                        el.constraint.forEach(radio => {
                            if (radio.value === Constraint.Edge) {
                                radio.checked = true;
                            }
                        });
                        break;
                    case Constraint.Node:
                        el.constraint.forEach(radio => {
                            if (radio.value === Constraint.Node) {
                                radio.checked = true;
                            }
                        });
                        break;
                    default:
                        console.error('No constraint selected');
                        break;
                }
                el.levelSelectionDialog.close();
                gotoLevel(parseInt(e.target.dataset.levelIdx));
            });
            container.appendChild(div);
        }
        lvlList.replaceChildren(container);
    }

    function resetLevel() {
        visited.clear();
        state = State.Playing;
        exitReached = false;
        let levelData = LEVELS[level.currentIdx];
        el.path.textContent = '';
        if (window.location.hash) {
            const hash = window.location.hash.substring(1);
            const params = hash.split(';');
            for (const param of params) {
                const [key, value] = param.split('=');
                if (key === 'level' && value.length > 0) {
                    levelData = JSON.parse(atob(value));
                }
            }
        }
        setLevel(levelData);
    }

    function restartGame() {
        let levelNum = Math.max(0, Math.min(LEVELS.length - 1, parseInt(localStorage.getItem(StorageKey.LevelNum))));
        if (isNaN(levelNum)) {
            levelNum = 0;
        }
        level.currentIdx = levelNum;
        resetLevel();
    }

    function resumeAudio() {
        return audioCtx.resume();
    }

    function checkAudio(e) {
        if (e && e.type === 'click' && e.target === el.loudspeaker) {
            soundEnabled = !soundEnabled;
            localStorage.setItem(StorageKey.SoundEnabled, soundEnabled);
        }
        if (!soundEnabled) {
            el.loudspeaker.classList.replace('speaker', 'speaker-muted');
        }
        else {
            el.loudspeaker.classList.replace('speaker-muted', 'speaker');
        }
    }

    function setupAudio() {
        audioCtx = new AudioContext();
        gainNode = audioCtx.createGain();
        gainNode.gain.value = parseFloat(localStorage.getItem('chilly-sound-volume') || '0.5');
        gainNode.connect(audioCtx.destination);
        for (const name of ['coin', 'rock', 'exit', 'teleport', 'slide']) {
            sounds[name] = {};
            fetch(`static/sounds/${name}.mp3`)
                .then(response => response.arrayBuffer())
                .then(arrayBuffer => audioCtx.decodeAudioData(arrayBuffer))
                .then(audioBuffer => {
                    sounds[name].buffer = audioBuffer;
                })
                .catch(error => {
                    console.error('Failed to load sound:', error);
                });
        }
        checkAudio();
    }

    function main() {
        LEVELS = JSON.parse(document.querySelector('#levels').textContent);
        el.game = document.querySelector('#game');
        el.game.addEventListener('click', onClick);
        el.invalidMoveDialog = document.querySelector('#invalid-move');
        el.invalidMoveDialog.addEventListener('close', () => {
            resetLevel();
        });
        el.constraint = document.querySelectorAll('[name="rules"]');
        el.constraint.forEach(radio => {
            radio.addEventListener('change', () => {
                const selectedConstraint = document.querySelector('input[name="rules"]:checked');
                el.constraint.value = selectedConstraint ? selectedConstraint.value : '';
                if (radio.checked) {
                    localStorage.setItem(StorageKey.Constraint, radio.value);
                }
            });
        });
        const initialSelectedConstraint = document.querySelector('input[name="rules"]:checked');
        const storedConstraint = localStorage.getItem(StorageKey.Constraint) || 'edge-constraint';
        if (storedConstraint && Array.from(el.constraint).some(radio => radio.value === storedConstraint)) {
            Array.from(el.constraint).find(radio => radio.value === storedConstraint).checked = true;
        }
        else {
            initialSelectedConstraint.checked = true;
        }
        el.constraint.value = storedConstraint;

        el.extraStyles = document.querySelector('#extra-styles');
        el.levelNum = document.querySelector('#level-num');
        el.moveCount = document.querySelector('#move-count');
        el.extras = document.querySelector('#extras');
        el.path = document.querySelector('#path');
        el.path.value = localStorage.getItem(StorageKey.Path) || '';
        el.path.addEventListener('input', () => {
            localStorage.setItem(StorageKey.Path, el.path.value);
            el.moveCount.textContent = el.path.value.length;
        });
        el.chooseLevel = document.querySelector('#choose-level');
        el.chooseLevel.addEventListener('click', showLevelSelectionScreen);
        el.loudspeaker = document.querySelector('#loudspeaker');
        el.loudspeaker.addEventListener('click', checkAudio);
        soundEnabled = localStorage.getItem(StorageKey.SoundEnabled) === "true";
        el.autoplayButton = document.querySelector('#autoplay');
        el.autoplayButton.addEventListener('click', autoplay);
        document.querySelector('#restart-level').addEventListener('click', resetLevel);
        el.splashDialog = document.querySelector('dialog#splash');
        el.congratsDialog = document.querySelector('dialog#congrats');
        el.congratsDialog.addEventListener('close', () => {
            resetLevel();
        });
        el.levelSelectionDialog = document.querySelector("dialog#level-selection");
        player.el = document.createElement('span');
        player.el.className = `tile penguin ${Tiles.PenguinUpright}`;
        setupAudio();
        window.addEventListener('keydown', onKeyPressed);
        window.addEventListener('keypress', onKeyPressed);
        window.addEventListener('resize', onResize);
        document.querySelector('.interactive.arrow-up').addEventListener('click', () => {
            window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 'w' }));
        });
        document.querySelector('.interactive.arrow-down').addEventListener('click', () => {
            window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 's' }));
        });
        document.querySelector('.interactive.arrow-right').addEventListener('click', () => {
            window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 'd' }));
        });
        document.querySelector('.interactive.arrow-left').addEventListener('click', () => {
            window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 'a' }));
        });
        restartGame();
        showSplashScreen();
        document.querySelector('#controls').classList.remove('hidden');
        window.dispatchEvent(new Event('resize'));
    }
    window.addEventListener('pageshow', main);
})(window);
