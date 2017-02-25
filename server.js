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
    var _ = require('lodash');

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
            this.lifeTime = 1000;
            this.aliveFrom = 0;
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
    var renderMs = 16.6666;
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
            socket.player.velocityInterval = setInterval(function () {
                socket.player.velocity += 0.001;
            });
        });

        socket.on("moveBackward", function () {
            clearInterval(socket.player.velocityInterval);
            socket.player.velocityInterval = setInterval(function () {
                socket.player.velocity -= 0.001;
            });
        });

        socket.on("moveLeft", function () {
            clearInterval(socket.player.angleInterval);
            socket.player.angleInterval = setInterval(function () {
                socket.player.angle -= 0.02;
            }, frameMs);
        });

        socket.on("moveRight", function () {
            clearInterval(socket.player.angleInterval);
            socket.player.angleInterval = setInterval(function () {
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
            var projectile = new Projectile(counterProjectile++, socket.player.position, socket.player.velocity + 5, 1);
            projectile.angle = socket.player.angle;

            // génère
            socket.emit("projectileEmitted", projectile);
            socket.broadcast.emit("newProjectileEmitted", projectile);

            projectiles.push(projectile);
        });

        socket.moveInterval = setInterval(function () {
            if (socket.player.velocity !== 0) {
                // caluler la nouvelle position
                socket.player.position.x += Math.cos(socket.player.angle) * socket.player.velocity;
                socket.player.position.y += Math.sin(socket.player.angle) * socket.player.velocity;
            }
        }, frameMs);

        socket.projectileInterval = setInterval(function () {

        });

        socket.renderInterval = setInterval(function () {
            io.emit('player.' + socket.player.id + ".moved", normalizePosition(socket.player));
        }, renderMs);
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

        socket.on("disconnect", function () {
            counterPlayer--;
            clearInterval(socket.player.velocityInterval);
            clearInterval(socket.moveInterval);
            clearInterval(socket.renderInterval);

        });
    });


    let projectileInterval = setInterval(function () {
        projectiles.forEach((projectile) => {
            if (projectile.velocity !== 0) {
                // caluler la nouvelle position
                projectile.position.x += Math.cos(projectile.angle) * projectile.velocity;
                projectile.position.y += Math.sin(projectile.angle) * projectile.velocity;

                io.emit('projectile.' + projectile.id + ".moved", normalizePosition(projectile));
            }

            if (projectile.aliveFrom > projectile.lifeTime) {
                io.emit('projectile.' + projectile.id + ".dead");
                _.remove(projectiles, { id: projectile.id });
            } else {
                projectile.aliveFrom += frameMs;
            }
        })
    }, frameMs);


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

Object.prototype.clone = Array.prototype.clone = function () {
    if (Object.prototype.toString.call(this) === '[object Array]') {
        var clone = [];
        for (var i = 0; i < this.length; i++)
            clone[i] = this[i].clone();

        return clone;
    }
    else if (typeof (this) == "object") {
        var clone = {};
        for (var prop in this)
            if (this.hasOwnProperty(prop))
                clone[prop] = this[prop].clone();

        return clone;
    }
    else
        return this;
}