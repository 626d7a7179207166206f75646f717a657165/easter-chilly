(function (window) {
    "use strict";
    const TILE_SIZE = 32;
    const ICE = ' ';
    const ROCK = '#';
    const EXIT = 'X';
    const PLAYER = 'P';
    const HOLE = 'O';
    const COIN = '$';
    const DEFAULT_GAME = ["####################", "#   # # #          #", "#      ###  #     O#", "#       #   #  #   #", "##  # #  # #       #", "#       #    #   ###", "#      # #  #      #", "##      #       ## #", "#    ### ### ## #  #", "#    #P #          #", "# O               ##", "#       #          #", "#        # #       #", "#   #   #   #    # #", "#    #   #  #  #   #", "#  #    #      ## ##", "#     #  #    ##   #", "#     # # #        X", "# #  ##    #    #  #", "####################"];
    const el = {};
    let player = {
        x: 0,
        y: 0,
        el: null,
        moves: [],
        distance: 0
    };
    let level, width, height;
    let holes = [];
    let isMoving = false;
    let exitReached = false;
    function placePlayerAt(x, y) {
        player.x = x;
        player.y = y;
        player.el.style.left = `${TILE_SIZE * x}px`;
        player.el.style.top = `${TILE_SIZE * y}px`;
    }
    function teleport() {
        const otherHole = holes.filter(v => v.x !== player.x && v.y !== player.y)[0];
        player.el.style.transitionDuration = '0s';
        placePlayerAt(otherHole.x, otherHole.y);
    }
    function onExitReached() {
        alert('Yippie yeah!');
    }
    function updateMoveCounter() {
        el.moveCount.textContent = player.moves.length;
        el.moveCount.setAttribute('data-moves', `${player.moves.join('')}`);
        el.moves.textContent = `${player.moves.join('')}`;
        el.distance.textContent = player.distance;
    }
    function move(dx, dy) {
        if (isMoving || exitReached)
            return;
        let { x, y } = player;
        while ([ICE, COIN].includes(level[y + dy][x + dx])) {
            x += dx;
            y += dy;
        }
        exitReached = level[y + dy][x + dx] === EXIT;
        const holeEntered = level[y + dy][x + dx] === HOLE;
        const dist = Math.abs((x - player.x) + (y - player.y));
        if (exitReached || holeEntered || dist > 0) {
            player.distance += dist;
            isMoving = true;
            player.el.style.transitionDuration = `${dist * 100}ms`;
            if (exitReached || holeEntered) {
                player.el.style.transitionTimingFunction = 'cubic-bezier(0.7, 0.2, 1, 1)';
                placePlayerAt(x + dx, y + dy);
            }
            else {
                player.el.style.transitionTimingFunction = 'cubic-bezier(0.7, 0.2, 1, 1.2)';
                placePlayerAt(x, y);
            }
            setTimeout(() => {
                isMoving = false;
                if (exitReached) {
                    onExitReached();
                }
                if (holeEntered) {
                    teleport();
                }
            }, 33 + 100 * dist);
        }
    }
    function moveUp() {
        move(0, -1);
    }
    function moveDown() {
        move(0, +1);
    }
    function moveLeft() {
        move(-1, 0);
    }
    function moveRight() {
        move(+1, 0);
    }
    function onKeyPressed(e) {
        const { x, y } = player;
        let move;
        switch (e.key) {
            case 'w':
            // fall-through
            case 'ArrowUp':
                moveUp();
                move = 'U';
                break;
            case 'a':
            // fall-through
            case 'ArrowLeft':
                moveLeft();
                move = 'L';
                break;
            case 's':
            // fall-through
            case 'ArrowDown':
                moveDown();
                move = 'D';
                break;
            case 'd':
            // fall-through
            case 'ArrowRight':
                moveRight();
                move = 'R';
                break;
        }
        if (move && (x !== player.x || y !== player.y)) {
            placePlayerAt(player.x, player.y);
            player.moves.push(move);
            updateMoveCounter();
        }
    }
    function onClick(e) {
        const dx = (e.target.offsetLeft / TILE_SIZE) - player.x;
        const dy = (e.target.offsetTop / TILE_SIZE) - player.y;
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
    }
    function onHashChanged() {
        let levelData = [...DEFAULT_GAME];
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
    function generateScene() {
        holes = [];
        const scene = document.createElement('div');
        scene.style.gridTemplateColumns = `repeat(${width}, ${TILE_SIZE}px)`;
        scene.style.gridTemplateRows = `repeat(${height}, ${TILE_SIZE}px)`;
        for (let y = 0; y < level.length; ++y) {
            const row = level[y];
            for (let x = 0; x < row.length; ++x) {
                const item = row[x];
                const tile = document.createElement('span');
                tile.className = 'tile';
                switch (item) {
                    case ROCK:
                        tile.classList.add('rock');
                        break;
                    case EXIT:
                        tile.classList.add('exit');
                        break;
                    case HOLE:
                        tile.classList.add('hole');
                        holes.push({ x, y });
                        break;
                    case PLAYER:
                        placePlayerAt(x, y);
                    // fall-through
                    case ICE:
                    default:
                        tile.classList.add('ice');
                        break;
                }
                scene.appendChild(tile);
            }
        }
        return scene;
    }
    function replacePlayerWithIceTile() {
        level[player.y] = level[player.y].substring(0, player.x) + ICE + level[player.y].substring(player.x + 1);
    }
    function setLevel(levelData) {
        level = levelData;
        width = level[0].length;
        height = level.length;
        player.moves = [];
        player.distance = 0;
        updateMoveCounter();
        el.scene = generateScene();
        el.game.replaceChildren(el.scene, player.el);
        replacePlayerWithIceTile();
    }
    function reset() {
        exitReached = false;
        onHashChanged();
    }
    function main() {
        el.game = document.querySelector('#game');
        el.game.addEventListener('click', onClick);
        el.distance = document.querySelector('#distance');
        el.moves = document.querySelector('#moves');
        el.moveCount = document.querySelector('#move-count');
        player.el = document.createElement('span');
        player.el.className = 'tile penguin';
        window.addEventListener('keydown', onKeyPressed);
        window.addEventListener('keypress', onKeyPressed);
        window.addEventListener('hashchange', onHashChanged);
        document.querySelector('.control.up').addEventListener('click', () => {
            window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 'w' }));
        });
        document.querySelector('.control.down').addEventListener('click', () => {
            window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 's' }));
        });
        document.querySelector('.control.right').addEventListener('click', () => {
            window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 'd' }));
        });
        document.querySelector('.control.left').addEventListener('click', () => {
            window.dispatchEvent(new KeyboardEvent('keypress', { 'key': 'a' }));
        });
        reset();
    }
    window.addEventListener('load', main);
})(window);