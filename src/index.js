(function (window) {
    "use strict";

    class State {
        static PreInit = -1;
        static SplashScreen = 0;
        static Playing = 1;
        static LevelEnd = 2;
        static GameEnd = 3;
        static SettingsScreen = 4;
        static ProgressScreen = 5;
    };

    class StorageKey {
        static LevelNum = 'glissade.level';
        static MaxLevelNum = 'glissade.max-level';
    };

    const POINTS = {
        $: 5,
        G: 20,
    };

    let LEVELS;
    const START_LEVEL = 0;
    const el = {};
    const easingWithoutOvershoot = bezier(.34, .87, 1, 1);
    const easingWithOvershoot = bezier(.34, .87, 1, 1.1);
    let player = {
        x: 0,
        y: 0,
        dest: { x: 0, y: 0 },
        el: null,
        score: 0,
        moves: [],
        distance: 0,
    };
    let level = {
        origData: [],
        connections: [],
        dumpConnections: function () {
            for (const conn of level.connections) {
                console.debug(`${conn.src.x},${conn.src.y} -> ${conn.dst.x},${conn.dst.y}`);
            }
        },
        data: [],
        score: 0,
        width: 0,
        height: 0,
        cellAt: function (x, y) {
            return level.data[(y + level.height) % level.height][(x + level.width) % level.width];
        },
        currentIdx: 0,
    };
    let state = State.PreInit;
    let prevState;
    let t0, t1, animationDuration;
    let pointsEarned;
    let tiles = [[]];
    let holes = [];
    let isMoving = false;
    let exitReached = false;
    let holeEntered = false;
    let easing = null;
    let sounds = {};

    // function sleep(delay) {
    //     return new Promise(resolve => setTimeout(resolve, delay));
    // }

    // async function bfsAnimate() {
    //     el.bfsButton.disabled = true;
    //     const Directions = {
    //         L: { dx: -1, dy: 0 },
    //         R: { dx: +1, dy: 0 },
    //         D: { dx: 0, dy: +1 },
    //         U: { dx: 0, dy: -1 },
    //     };
    //     const norm_x = x => (x + level.width) % level.width;
    //     const norm_y = y => (y + level.height) % level.height;
    //     const SLEEP_MS = 67;
    //     const handleVisit = async (dst, move, src) => {
    //         const visited = document.createElement('span');
    //         visited.className = 'tile visited';
    //         tiles[dst.y][dst.x].appendChild(visited);
    //         if (move && src) {
    //             el.game.querySelectorAll('.line').forEach(el => el.remove());
    //             const { dx, dy } = Directions[move];
    //             let x = norm_x(src.x + dx);
    //             let y = norm_y(src.y + dy);
    //             if (dst.id !== Tile.Hole) {
    //                 while (norm_x(x) !== dst.x || norm_y(y) !== dst.y) {
    //                     const line = document.createElement('span');
    //                     line.className = 'tile line';
    //                     if (norm_x(x + dx) === dst.x && norm_y(y + dy) === dst.y) {
    //                         switch (move) {
    //                             case 'L': line.classList.add('left-arrow'); break;
    //                             case 'R': line.classList.add('right-arrow'); break;
    //                             case 'U': line.classList.add('up-arrow'); break;
    //                             case 'D': line.classList.add('down-arrow'); break;
    //                             default: break;
    //                         }
    //                     }
    //                     else {
    //                         line.classList.add(dx === 0 ? 'vline' : 'hline');
    //                     }
    //                     tiles[norm_y(y)][norm_x(x)].appendChild(line);
    //                     x += dx;
    //                     y += dy;
    //                 }

    //             }
    //         }
    //         await sleep(SLEEP_MS);
    //     };
    //     el.game.querySelectorAll('.visited, .line').forEach(el => el.remove());
    //     const solver = new ChillySolver([...level.origData]);
    //     await solver.shortestPath(handleVisit);
    //     el.bfsButton.disabled = false;
    // }

    async function findRoute() {
        el.findRouteButton.disabled = true;
        const solver = new ChillySolver([...level.origData]);
        el.game.querySelectorAll('.cross').forEach(el => el.remove());
        let t0;
        t0 = performance.now();
        const nodes = solver.findNodes();
        console.log(`Nodes found: ${nodes.length}; dt = ${(performance.now() - t0)} ms`, nodes);
        for (const node of nodes) {
            const cross = document.createElement('span');
            cross.className = `tile cross`;
            tiles[node.y][node.x].appendChild(cross);
        }
        // console.debug(solver.edges);
        t0 = performance.now();
        const [_source, _destination, route] = await solver.dijkstra2D();
        console.log(`Route found, dt = ${(performance.now() - t0)} ms`);
        console.log(route);
        el.findRouteButton.disabled = false;
        return nodes;
    }

    async function help() {
        const solver = new ChillySolver({
            data: level.origData,
            connections: level.connections,
        });
        let [node, iterations] = await solver.shortestPath();
        console.debug(`iterations = ${iterations}, nodes = ${solver.nodeCount}`);
        if (node === null) {
            document.querySelector('#path').textContent = '<no solution>';
            return;
        }
        let path = [node];
        while (node.hasParent()) {
            node = node.parent;
            path.unshift(node);
        }
        const moves = [];
        const HINT_NAMES = { 'U': 'hint-up', 'R': 'hint-right', 'D': 'hint-down', 'L': 'hint-left' };
        let { x, y } = path[0];
        for (let i = 1; i < path.length; ++i) {
            let node = path[i];
            moves.push(node.move);
            const hint = document.createElement('div');
            hint.className = `tile hint ${HINT_NAMES[node.move]}`;
            if (tiles[y][x].children.length === 0) {
                tiles[y][x].appendChild(hint);
            }
            x = node.x;
            y = node.y;
        }
        document.querySelector('#path').textContent = `${moves.length}: ${moves.join('')}`;
    }

    function placePlayerAt(x, y) {
        player.x = (x + level.width) % level.width;
        player.y = (y + level.height) % level.height;
        player.el.style.left = `${Tile.Size * player.x}px`;
        player.el.style.top = `${Tile.Size * player.y}px`;
    }

    function scrollIntoView() {
        // XXX: good idea, but doesn't work :-/
        player.el.scrollIntoView();
    }

    function standUpright() {
        for (const c of ['penguin-left', 'penguin-right', 'penguin-up', 'penguin-down']) {
            player.el.classList.remove(c);
        }
    }

    function teleport() {
        sounds.teleport.play();
        const connection = level.connections.find(conn => conn.src.x === player.x && conn.src.y === player.y);
        if (connection) {
            const otherHole = connection.dst;
            placePlayerAt(otherHole.x, otherHole.y);
        }
        scrollIntoView();
        standUpright();
    }

    function rockHit() {
        sounds.rock.play();
        standUpright();
    }

    function updateMoveCounter() {
        el.moveCount.title = player.moves.join('');
        el.moveCount.textContent = player.moves.length;
    }

    function animate() {
        const dt = performance.now() - t0;
        const f = easing(dt / animationDuration);
        const dx = f * (player.dest.x - player.x);
        const dy = f * (player.dest.y - player.y);
        const x = (player.x + Math.round(dx) + level.width) % level.width;
        const y = (player.y + Math.round(dy) + level.height) % level.height;
        if (level.data[y][x] === Tile.Coin) {
            tiles[y][x].classList.replace('coin', 'ice');
            level.data[y] = level.data[y].substring(0, x) + Tile.Ice + level.data[y].substring(x + 1);
            player.score += POINTS[Tile.Coin];
            el.levelScore.textContent = player.score;
            sounds.coin.play();
        }
        player.el.style.left = `${Tile.Size * ((player.x + dx + level.width) % level.width)}px`;
        player.el.style.top = `${Tile.Size * ((player.y + dy + level.height) % level.height)}px`;
        scrollIntoView();
        if (performance.now() > t1) {
            placePlayerAt(player.dest.x, player.dest.y);
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
            requestAnimationFrame(animate);
        }
    }

    function move(dx, dy) {
        if (isMoving || exitReached)
            return;
        let hasMoved = false;
        let { x, y } = player;
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
            player.el.classList.add('penguin-right');
            hasMoved = true;
        }
        else if (xStep < 0) {
            player.el.classList.add('penguin-left');
            hasMoved = true;
        }
        else if (yStep < 0) {
            player.el.classList.add('penguin-up');
            hasMoved = true;
        }
        else if (yStep > 0) {
            player.el.classList.add('penguin-down');
            hasMoved = true;
        }
        else if (exitReached || holeEntered) {
            hasMoved = true;
            dist += 1;
        }
        if (dist > 0) {
            player.distance += dist;
            isMoving = true;
            if (exitReached || holeEntered) {
                player.dest.x = x + dx;
                player.dest.y = y + dy;
                easing = easingWithoutOvershoot;
            }
            else {
                player.dest = { x, y };
                easing = easingWithOvershoot;
            }
            animationDuration = 100 * dist;
            t0 = performance.now();
            t1 = t0 + animationDuration;
            requestAnimationFrame(animate);
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

    function onKeyPressed(e) {
        switch (state) {
            case State.GameEnd:
                if (e.type === 'keypress') {
                    if (e.key === 'r') {
                        replayLevel();
                    }
                    e.preventDefault();
                }
                break;
            case State.LevelEnd:
                if (e.type === 'keypress') {
                    if (e.key === ' ') {
                        gotoNextLevel();
                    }
                    else if (e.key === 'r') {
                        replayLevel();
                    }
                    e.preventDefault();
                }
                break;
            case State.SettingsScreen:
                if (e.type === 'keydown' && e.key === 'Escape') {
                    removeOverlay();
                    restoreState();
                    e.preventDefault();
                    return;
                }
                break;
            case State.SplashScreen:
                if (e.type === 'keypress' && e.key === ' ') {
                    e.preventDefault();
                    play();
                }
                break;
            case State.Playing:
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
                    case 'Escape':
                        if (e.type === 'keydown') {
                            showSettingsScreen();
                            e.preventDefault();
                            return;
                        }
                        break;
                }
                if (hasMoved) {
                    player.moves.push(move);
                }
                break;
            default:
                if (e.type === 'keydown' && e.key === 'Escape') {
                    if (state != State.SplashScreen) {
                        showSettingsScreen();
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
        holes = [];
        tiles = [];
        for (let y = 0; y < level.data.length; ++y) {
            const row = level.data[y];
            tiles.push([]);
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
                        tile.classList.add('coin');
                        break;
                    case Tile.Gold:
                        tile.classList.add('gold');
                        break;
                    case Tile.Flower:
                        tile.classList.add('flower');
                        break;
                    case Tile.Exit:
                        tile.classList.add('exit');
                        break;
                    case Tile.Hole:
                        tile.classList.add('hole');
                        holes.push({ x, y });
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
                tiles[y].push(tile);
            }
        }
        return scene;
    }

    function replacePlayerWithIceTile() {
        level.data[player.y] = level.data[player.y].substring(0, player.x) + Tile.Ice + level.data[player.y].substring(player.x + 1);
    }

    function getNumStars() {
        const numStars = 3 - LEVELS[level.currentIdx].thresholds.findIndex(threshold => player.moves.length <= threshold);
        if (numStars === 4) {
            return 0;
        }
        return numStars;
    }

    function animatePointsEarned() {
        const ANIMATION_DURATION = 750;
        const dt = performance.now() - t0;
        const f = dt / ANIMATION_DURATION;
        el.pointsEarned.textContent = Math.round(f * pointsEarned);
        if (dt < ANIMATION_DURATION) {
            window.requestAnimationFrame(animatePointsEarned);
        }
    }

    function onExitReached() {
        sounds.exit.play();
        standUpright();
        // console.debug(level.currentIdx, LEVELS.length, level.currentIdx < LEVELS.length);
        setState(State.LevelEnd);
        const congrats = el.congratsTemplate.content.cloneNode(true);
        congrats.querySelector('div.pulsating > span').textContent = level.currentIdx + 1 + 1;
        const stars = congrats.querySelectorAll('.star-pale');
        const numStars = getNumStars();
        for (let i = 0; i < numStars; ++i) {
            stars[i].classList.replace('star-pale', 'star');
            stars[i].classList.add('pulse');
        }
        congrats.querySelector('div>div>div').innerHTML = (function () {
            switch (numStars) {
                case 0:
                    return 'Awww ... you could do better';
                case 1:
                    return 'Well done, but there&rsquo;s room for improvement.';
                case 2:
                    return 'Good job! But you could do a tiny bit better.';
                case 3:
                    return 'Excellent! You’ve scored perfectly.';
                default:
                    return;
            }
        })();
        el.pointsEarned = congrats.querySelector('.points-earned');
        el.proceed = congrats.querySelector('[data-command="proceed"]');
        if (level.currentIdx + 1 < LEVELS.length) {
            congrats.querySelector('[data-command="restart"]').remove();
            el.proceed.addEventListener('click', gotoNextLevel, { capture: true, once: true });
        }
        else {
            el.proceed.remove();
            setState(State.GameEnd);
        }
        el.replay = congrats.querySelector('[data-command="replay"]');
        el.replay.addEventListener('click', replayLevel, { capture: true, once: true });
        el.overlayBox.replaceChildren(congrats);
        t0 = performance.now();
        pointsEarned = getLevelScore();
        animatePointsEarned();
        showOverlay();
    }

    /**
     * @return  true, if level has collectibles, false otherwise
     */
    function levelHasCollectibles() {
        return level.origData.some(row => row.match('[\$G]'));
    }

    function setLevel(levelData) {
        console.debug(levelData);
        level.data = [...levelData.data];
        level.connections = levelData.connections;
        level.origData = [...levelData.data];
        level.width = level.data[0].length;
        level.height = level.data.length;
        if (level.connections instanceof Array) {
            for (const conn of level.connections) {
                console.assert(level.cellAt(conn.src.x, conn.src.y) === Tile.Hole);
                console.assert(level.cellAt(conn.dst.x, conn.dst.y) === Tile.Hole);
            }
        }
        el.levelNum.textContent = `Level ${level.currentIdx + 1}`;
        player.moves = [];
        player.distance = 0;
        updateMoveCounter();
        el.scene = generateScene();
        el.game.replaceChildren(el.scene, player.el);
        replacePlayerWithIceTile();
        // el.findRouteButton.disabled = !levelHasCollectibles();
    }

    function restoreState() {
        state = prevState;
    }

    function setState(newState) {
        prevState = state;
        state = newState;
    }

    function showOverlay() {
        el.overlay.classList.remove('hidden');
        el.overlayBox.classList.remove('hidden');
    }

    function removeOverlay() {
        el.overlay.classList.add('hidden');
        el.overlayBox.classList.add('hidden');
        el.overlayBox.replaceChildren();
    }

    function play() {
        el.overlayBox.removeEventListener('click', play);
        setState(State.Playing);
        removeOverlay();
        checkAudio();
    }

    function replayLevel() {
        el.replay.addEventListener('click', replayLevel, { capture: true, once: true });
        player.score -= level.score;
        resetLevel();
        play();
    }

    function maxLevelNum() {
        let maxLvl = parseInt(localStorage.getItem(StorageKey.MaxLevelNum));
        if (isNaN(maxLvl)) {
            maxLvl = 0;
        }
        console.debug(level.currentIdx, LEVELS.length, maxLvl);
        maxLvl = Math.max(level.currentIdx, Math.min(LEVELS.length, maxLvl));
        return maxLvl;
    }

    function getLevelScore() {
        return (getNumStars() + 1) * (level.score + LEVELS[level.currentIdx].basePoints);
    }

    function gotoLevel(idx) {
        level.currentIdx = idx;
        localStorage.setItem(StorageKey.LevelNum, level.currentIdx);
        resetLevel();
        play();
    }

    function gotoNextLevel() {
        el.proceed.removeEventListener('click', gotoNextLevel);
        player.score += pointsEarned;
        el.totalScore.textContent = player.score;
        ++level.currentIdx;
        localStorage.setItem(StorageKey.LevelNum, level.currentIdx);
        localStorage.setItem(StorageKey.MaxLevelNum, maxLevelNum() + 1);
        resetLevel();
        play();
    }

    function showSplashScreen() {
        setState(State.SplashScreen);
        const splash = el.splashTemplate.content.cloneNode(true);
        el.overlayBox.replaceChildren(splash);
        el.overlayBox.addEventListener('click', play, { capture: true, once: true });
        showOverlay();
    }

    function showSettingsScreen() {
        setState(State.SettingsScreen);
        const settings = el.settingsTemplate.content.cloneNode(true);
        const lvlList = settings.querySelector('.level-list');
        const padding = 1 + Math.floor(Math.log10(LEVELS.length));
        for (let i = 0; i < maxLevelNum(); ++i) {
            const div = document.createElement('div');
            const lvlName = LEVELS[i].name
                ? LEVELS[i].name
                : '<?>';
            div.textContent = `Level ${(i + 1).toString().padStart(padding, ' ')}: ${lvlName}`;
            div.addEventListener('click', () => {
                removeOverlay();
                gotoLevel(i);
            });
            lvlList.appendChild(div);
        }
        el.overlayBox.replaceChildren(settings);
        showOverlay();
    }

    function resetLevel() {
        exitReached = false;
        level.score = 0;
        el.levelScore.textContent = '0';
        el.totalScore.textContent = player.score;
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
        let levelNum = Math.min(LEVELS.length - 1, parseInt(localStorage.getItem(StorageKey.LevelNum)));
        if (isNaN(levelNum)) {
            levelNum = START_LEVEL;
        }
        if (levelNum < 0) {
            levelNum = 0;
        }
        level.currentIdx = levelNum;
        resetLevel();
    }

    function checkAudio(e) {
        if (typeof e === 'object' && e.type === 'click') {
            Howler.mute(!Howler._muted);
        }
        if (Howler._muted) {
            el.loudspeaker.classList.replace('speaker', 'speaker-muted');
        }
        else {
            el.loudspeaker.classList.replace('speaker-muted', 'speaker');
        }
    }

    function setupAudio() {
        sounds.coin = new Howl({
            src: ['static/sounds/coin.mp3', 'static/sounds/coin.webm', 'static/sounds/coin.ogg'],
        });
        sounds.rock = new Howl({
            src: ['static/sounds/rock.mp3', 'static/sounds/rock.webm', 'static/sounds/rock.ogg'],
        });
        sounds.exit = new Howl({
            src: ['static/sounds/exit.mp3', 'static/sounds/exit.webm', 'static/sounds/exit.ogg'],
        });
        sounds.teleport = new Howl({
            src: ['static/sounds/teleport.mp3', 'static/sounds/teleport.webm', 'static/sounds/teleport.ogg'],
        });
        sounds.slide = new Howl({
            src: ['static/sounds/slide.mp3', 'static/sounds/slide.webm', 'static/sounds/slide.ogg'],
            volume: .5,
        });
        Howler.mute(false);
        checkAudio();
    }

    function main() {
        LEVELS = JSON.parse(document.querySelector('#levels').textContent);
        el.game = document.querySelector('#game');
        el.game.addEventListener('click', onClick);
        // el.gameContainer = document.querySelector('#game-container');
        el.totalScore = document.querySelector('#total-score');
        el.levelScore = document.querySelector('#level-score');
        el.levelNum = document.querySelector('#level-num');
        el.moveCount = document.querySelector('#move-count');
        el.extras = document.querySelector('#extras');
        el.path = document.querySelector('#path');
        el.overlay = document.querySelector('#overlay');
        el.overlayBox = document.querySelector('#overlay-box');
        el.chooseLevel = document.querySelector('#choose-level');
        el.chooseLevel.addEventListener('click', showSettingsScreen);
        el.loudspeaker = document.querySelector('#loudspeaker');
        el.loudspeaker.addEventListener('click', checkAudio);
        // el.findRouteButton = document.querySelector('#find-route');
        // el.findRouteButton.addEventListener('click', findRoute);
        document.querySelector('#restart-level').addEventListener('click', resetLevel);
        document.querySelector('#help').addEventListener('click', help);
        // el.bfsButton = document.querySelector('#bfs');
        // el.bfsButton.addEventListener('click', bfsAnimate);
        el.splashTemplate = document.querySelector("#splash");
        el.congratsTemplate = document.querySelector("#congrats");
        el.settingsTemplate = document.querySelector("#settings");
        player.el = document.createElement('span');
        player.el.className = 'tile penguin';
        setupAudio();
        window.addEventListener('keydown', onKeyPressed);
        window.addEventListener('keypress', onKeyPressed);
        document.querySelector('.control.arrow-up').addEventListener('click', () => {
            window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 'w' }));
        });
        document.querySelector('.control.arrow-down').addEventListener('click', () => {
            window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 's' }));
        });
        document.querySelector('.control.arrow-right').addEventListener('click', () => {
            window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 'd' }));
        });
        document.querySelector('.control.arrow-left').addEventListener('click', () => {
            window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 'a' }));
        });
        restartGame();
        showSplashScreen();
        document.querySelector('#controls').classList.remove('hidden');
    }
    window.addEventListener('load', main);
})(window);
