var cluster = require('cluster');

var workers = process.env.WORKERS || 1;

// cluster management
if (cluster.isMaster) {

    console.log('start cluster with %s workers', workers);

    for (var i = 0; i < workers; ++i) {
        var worker = cluster.fork().process;
        console.log('worker %s started.', worker.pid);
    }

    cluster.on('exit', function (worker) {
        console.log('worker %s died. restart...', worker.process.pid);
        cluster.fork();
    });

} else {
    // init server
    var express = require('express')
        , app = express()
        , server = require('http').createServer(app)
        , io = require('socket.io').listen(server)
        , readline = require('readline')
        , exec = require('child_process').exec
        , fs = require('fs');

    var bodyParser = require('body-parser');
    app.use(bodyParser.json());

    app.use(express.static(__dirname + '/front/'));
    app.use(express.static(__dirname + '/node_modules/'));
    app.use(express.static(__dirname + '/bower_components/'));

    server.listen(8080);

    process.on('uncaughtException', function (err) {
        console.log('Caught exception: ' + err);
        process.exit();
    });

    // var&class definition
    var counterPlayer = 0;
    var counterProjectile = 0;
    var nextSpawnPointToUsed = 1;
    var players = [];
    var projectiles = [];

    class Position {
        constructor(x, y) {
            this.x = x;
            this.y = y;
        }
        toString() {
            return "Position : "
                + " x : " + this.x
                + " y : " + this.y
        }
    };

    class Weapon {
        constructor(name) {
            this.name = name;
        }
        toString() {
            return "Weapon : {"
                + " name : " + this.name
                + " }"
        }
    }
    class Projectile {
        constructor(identifier, position, velocity, damage) {
            this.id = identifier;
            this.position = new Position(position.x, position.y);
            this.angle = 0;
            this.velocity = velocity;
            this.damage = damage;
        }
        toString() {
            return " id : " + this.id
                + " pos : " + this.pos.toString()
                + " angle : " + this.angle
                + " velocity : " + this.velocity
        }
    }

    class SpaceShip {
        constructor(identifier, structurePoint, spawnPoint) {
            this.id = identifier;
            this.position = spawnPoint.position;
            this.angle = spawnPoint.angle;
            this.velocity = 0;
            this.structurePoint = structurePoint;
            this.weapons = [];
        }
        toString() {
            return " id : " + this.id
                + " position : " + this.position.toString()
                + " angle : " + this.angle
                + " velocity : " + this.velocity
                + " structurePoint : " + this.structurePoint
                + " firstWeapon : " + this.weapons[0] !== undefined ? this.weapons[0].toString() : "no weapon"
        }

        addWeapon(weapon) {
            this.weapons.push(weapon);
            console.log("arme ajoutée :", weapon.toString());
        }
    };

    class SpawnPoint {
        constructor(identifier, position, angle = 0) {
            this.id = identifier;
            this.position = position;
            this.angle = angle;
        }
        toString() {
            return " id : " + this.id
                + " position : " + this.position.toString()
                + " angle : " + this.angle
        }
    };

    /**
     *
     *  CATALOGUES INITIALISATION
     *
     **/

    var projectilesCatalog = [
        new Projectile(1, 10, 1),
        new Projectile(2, 2, 10),
    ];

    var weaponsCatalog = [
        new Weapon('machineGun'),
        new Weapon('rockets'),
    ];

    var spawnPointCatalog = [
        new SpawnPoint(1, new Position(10, 10), 0),
        new SpawnPoint(2, new Position(390, 10), 0),
        new SpawnPoint(3, new Position(10, 390), 0),
        new SpawnPoint(4, new Position(390, 390), 0)
    ];

    var frameMs = 16.6666;
    /**
     *
     *  functions
     *
     **/

    function spawnPointSelection() {
        var spawnPoint = spawnPointCatalog[nextSpawnPointToUsed - 1];

        if (nextSpawnPointToUsed == 4) {
            nextSpawnPointToUsed = 1;
        } else {
            nextSpawnPointToUsed++;
        }
        return spawnPoint;
    }

    /**
     *
     *  SOCKET IO EVENTS
     *
     **/
    io.sockets.on('connection', function (socket) {

        console.log('dans la connexion', counterPlayer);
        counterPlayer++;
        var health = 100;

        var spaceS = new SpaceShip(socket.id, health, spawnPointSelection());
        spaceS.addWeapon(weaponsCatalog[0]);
        socket.player = spaceS;

        socket.emit("connected", { myself: socket.player, othersPlayers: players, projectiles: projectiles });
        socket.broadcast.emit("newPlayerConnected", socket.player);

        players[counterPlayer - 1] = socket.player;

        socket.on("moveForward", function () {
            clearInterval(socket.player.velocityInterval);
            socket.player.velocityInterval = setInterval(() => {
                socket.player.velocity += 0.001;
            });
        });

        socket.on("moveBackward", function () {
            clearInterval(socket.player.velocityInterval);
            socket.player.velocityInterval = setInterval(() => {
                socket.player.velocity -= 0.001;
            });
        });

        socket.on("moveLeft", function () {
            clearInterval(socket.player.angleInterval);
            socket.player.angleInterval = setInterval(() => {
                socket.player.angle -= 0.02;
            }, frameMs);
        });

        socket.on("moveRight", function () {
            clearInterval(socket.player.angleInterval);
            socket.player.angleInterval = setInterval(() => {
                socket.player.angle += 0.02;
            }, frameMs);
        });

        socket.on("stopedMovedAngle", function () {
            clearInterval(socket.player.angleInterval);
        });

        socket.on("stopedMovedVelocity", function () {
            clearInterval(socket.player.velocityInterval);
        });

        socket.on("shoot", function () {
            counterProjectile++;
            var projectile = new Projectile(counterProjectile++, socket.player.position, socket.player.velocity + 10, 1);
            projectile.angle = socket.player.angle;

            // génère
            socket.emit("projectileEmitted", projectile);
            socket.broadcast.emit("newProjectileEmitted", projectile);

            projectiles.push(projectile);
        });

        socket.moveInterval = setInterval(() => {
            if (socket.player.velocity !== 0) {
                // caluler la nouvelle position
                socket.player.position.x += Math.cos(socket.player.angle) * socket.player.velocity;
                socket.player.position.y += Math.sin(socket.player.angle) * socket.player.velocity;
            }
        }, frameMs)

        socket.renderInterval = setInterval(() => {
            io.emit('player.' + socket.player.id + ".moved", normalizePosition(socket.player));
        }, frameMs);
        /*
            EVENTS IMPLEMENTED :
            connected
            newPlayerConnected
            moveForward
            moveBackward
            moveLeft
            moveRight
            shoot
            projectileEmitted
            newProjectileEmitted

            NOT IMPLEMENTED :
            endOfFire
            psChange
            playerDeath

            TODO :
            OK - Add la liste des autres joueurs et des projectiles dans le retour de la premiere connection.
            OK - Calculer les nouveaux déplacements
        */

    });

    setInterval(function () {

        // maj projectiles
        projectiles.forEach(function (element) {
            if (element.velocity !== 0) {
                // caluler la nouvelle position
                element.position.x += Math.cos(element.angle) * element.velocity;
                element.position.y += Math.sin(element.angle) * element.velocity;
            }
            io.emit('projectile.' + element.id + ".moved", element);
        }, this);

        // io.emit('broadcast', updateData);
    }, 200);
}








function normalizePosition(player) {
    return {
        position: {
            x: parseInt(player.position.x),
            y: parseInt(player.position.y),
        },
        angle: player.angle
    }
}