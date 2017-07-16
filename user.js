var mongo = require('mongodb').MongoClient;
var vsprintf = require('sprintf').vsprintf;

class User {
        constructor() {
                this.name = '';
                this.phoneNumber = '';
                this.num_win = 0;
                this.num_lose = 0;
                this.point = 0;
                this.isPromoting = false;
                this.tier = 30;
        }

        connect(phoneNumber, name, cb) {
                mongo.connect('mongodb://localhost:27017/bat', (error, db) => {
                        if (error) console.log(error);
                        else {
                                var user = db.collection('account').findOne({
                                        phoneNumber: phoneNumber
                                }, (err, ele) => {
                                        // ele가 null이면 새로 가입한다.
                                        if (ele == null) {
                                                db.collection('account').insert({
                                                        'phoneNumber': phoneNumber,
                                                        'name' : name,
                                                        'num_win': 0,
                                                        'num_lose': 0,
                                                        'point': 0,
                                                        'tier': 30,
                                                        'isPromoting': false
                                                });

                                                ele = {}
                                                ele.num_win = 0;
                                                ele.num_lose = 0;
                                                ele.point = 0;
                                                ele.tier = 30;
                                                ele.isPromoting = false;

                                                console.log(vsprintf("%s 가입 완료", [phoneNumber]));
                                        }

                                        this.phoneNumber = phoneNumber;
                                        this.name = name;
                                        this.num_win = ele.num_win;
                                        this.num_lose = ele.num_lose;
                                        this.point = ele.point;
                                        this.isPromoting = ele.isPromoting;
                                        this.tier = ele.tier;

                                        console.log(vsprintf('%s 연결 완료', [phoneNumber]));

                                        db.close();

                                        // 연결 작업 끝났으면 콜백 실행.
                                        cb();
                                });
                        }
                });
        }
}

module.exports = User;
