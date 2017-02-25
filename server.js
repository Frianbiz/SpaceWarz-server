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

}
else {

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
                + " damage : " + this.damage
                + " }"
        }
    }
    class Projectile {
        constructor(identifier, velocity, damage) {
            this.id = identifier;
            this.position = {};
            this.angle = 0;
            this.velocity = undefined;
            this.damage = undefined;
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
        get toString() {
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
    // Projectiles
    var projectilesCatalog = [
        new Projectile(1, 10, 1),
        new Projectile(2, 2, 10),
    ];

    // weapons
    var weaponsCatalog = [
        new Weapon('machineGun'),
        new Weapon('rockets'),
    ];

    // spawn point
    var spawnPointCatalog = [
        new SpawnPoint(1, new Position(10, -10), 0),
        new SpawnPoint(2, new Position(390, -10), 0),
        new SpawnPoint(3, new Position(10, -390), 0),
        new SpawnPoint(4, new Position(390, -390), 0)
    ];

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

        var spawnP = spawnPointSelection();
        var spaceS = new SpaceShip(counterPlayer, health, spawnP);
        spaceS.addWeapon(weaponsCatalog[0]);
        console.log("new spaceShip", spaceS);
        console.log("new spaceShip", spaceS.toString());
        socket.player = spaceS;
        players[counterPlayer - 1] = socket.player;

        socket.emit("connected", { myself: socket.player, details: socket.player.toString() });
        socket.broadcast("newPlayerConnected : ", socket.player.id);

        // events:
        // connexion
        // deplacement
        // tir: return velocite
        // finDeTir
        // changementPV
        // mortJoueur

        // récepetion
        socket.on("move", function (data) {


            //renvoie une confirmation avec les nouvelles coordonnées
        });

        socket.on("shoot", function (data) {

            //renvoie une la vélocité
        });

        // socket.emit("played", { matrice: MATRICE, player: socket.player });
        //émission
        // io.to(players.J.id).emit("endOfFire");
        // io.to(players.J.id).emit("psChange");
        // io.to(players.J.id).emit("playerDeath");

    });

    setInterval(function () {
        // io.to(players[0]).emit("update");
        // console.log("Update Emitted");
    }, 16);
}
