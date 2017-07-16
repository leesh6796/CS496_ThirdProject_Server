var mongo = require('mongodb').MongoClient;
var vsprintf = require('sprintf').vsprintf;

class Game {
        constructor(requester, allower) { // parameter는 phoneNumber로 받는다.
                this.requester = requester;
                this.allower = allower;
                this.board = new Array(15 * 15);
        }

        getPoint(col, row) {
                return 15 * col + row;
        }
}

module.exports = Game
