const {Application} = require('express');
const {Client} = require('pg');
const formidable = require('formidable');
const fs = require('fs');


const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

//random id
function makeid(length) {
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

/**
 * @param {Application} app Application express
 * @param {Client} pgsql Base de données
 * @param {String} dirname Nom du répertoire du serveur
 * @param {Map} cookies Liste des utilisateurs connectés et leurs cookies
 */
module.exports = function (app, pgsql, dirname, cookies) {

    function hasPermission(email, permission) {
        return new Promise((resolve, reject) => {
            pgsql.query(`SELECT * FROM utilisateur U
            NATURAL JOIN role R
            WHERE email='${email}'`)
                .then(data => {
                    data.rows[0].permissions = data.rows[0].permissions.split(" ")
                    if (data.rows[0].permissions.includes(permission)) resolve();
                    else reject(`L'utilisateur ${email} n'a pas la permission ${permission}`);
                })
                .catch(err => {
                    reject(err);
                })
        })
    }

    // email et pwd en parametre
    app.post('/login', (req, res) => {
        pgsql.query(`SELECT *
                     FROM utilisateur 
                     WHERE email='${req.body.email}'`)
            .then(query => {
                // if 0
                if (query.rowCount === 0) res.status(400).send("Utilisateur non trouvé");
                else {
                    if (query.rows[0].password !== req.body.password) res.status(403).send("Mot de passe incorrect");
                    else {
                        const cookie = makeid(32);
                        cookies.set(cookie, req.body.email);
                        // -> cookie
                        res.cookie('user', cookie); // -> envoit cookie
                        res.send('Success');
                    }
                }
            })
            .catch(err => {
                res.sendStatus(500);
                console.error(err);
            })
    });

    app.post('/register', (req, res) => {
        const name = req.body.name;
        const firstname = req.body.firstname;
        const email = req.body.email;
        const password = req.body.password;
        pgsql.query(`SELECT * FROM utilisateur WHERE email='${email}'`)
            .then(data => {
                if (data.rowCount !== 0) {
                    res.status(409);
                    return;
                }
                pgsql.query(`INSERT INTO utilisateur(username, password, prenom, nom, email) VALUES
            ('${(firstname.substring(0, 1) + name.substring(0, 10)).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}',
            '${password}', '${firstname}', '${name}', '${email}')`)
                    .then(() => {
                        const cookie = makeid(32);
                        cookies.set(cookie, email);
                        res.cookie('user', cookie);
                        res.send('Success');
                    })
                    .catch(err => {
                        console.error(err);
                        res.status(500);
                    });
            })
            .catch(err => {
                console.error(err);
                res.status(500);
            });

    });
//photo marche pas, recuperer img user gravatar /reintialiser pwd
    app.post('/updateUser', (req, res) => {
        if (req.cookies.user && cookies.has(req.cookies.user)) {
            pgsql.query(`UPDATE utilisateur
                     SET username = '${req.body.username}', nom = '${req.body.nom}', prenom = '${req.body.prenom}', email = '${req.body.mail}'
                     WHERE email='${cookies.get(req.cookies.user)}'`)
                .then(() => {
                    res.send("Ok")
                })
                .catch(err => {
                    console.error(err);
                    res.status(500);
                })
        } else res.status(501);
    });

    app.post('/upload', (req, res) => {
        if (req.cookies.user && cookies.has(req.cookies.user)) {
            hasPermission(cookies.get(req.cookies.user), 'create_schema')
                .then(() => {
                    const form = new formidable.IncomingForm();
                    form.parse(req, function (err, fields, files) {
                        if (files.image) {
                            const oldpath = files.image.path;
                            const type = files.image.type.split('/')[0];
                            if (type !== 'image') {
                                res.sendStatus(415);
                                return;
                            }
                            pgsql.query(`INSERT INTO schema(email) VALUES ('${cookies.get(req.cookies.user)}') RETURNING id_schema`)
                                .then(data => {
                                    //deplace image
                                    const newpath = __dirname.replace('app', '') + '/images/' + data.rows[0].id_schema + '.jpg';
                                    fs.rename(oldpath, newpath, function (err) {
                                        if (err) {
                                            res.sendStatus(500);
                                            console.error(err);
                                        } else {
                                            res.send("" + data.rows[0].id_schema);
                                        }
                                    });
                                })
                                .catch(err => {
                                    res.sendStatus(500);
                                    console.error(err);
                                });
                        } else {
                            res.status(400);
                        }
                    });
                }).catch(err => {
                console.error(err);
                res.status(501);
            });
        } else res.status(501);
    });

    app.post('/save', (req, res) => {
        if (req.cookies.user && cookies.has(req.cookies.user)) {
            hasPermission(cookies.get(req.cookies.user), 'create_schema')
                .then(() => {
                    if (!req.body.id) {
                        res.sendStatus(403);
                        return;
                    }
                    pgsql.query(`UPDATE schema SET legendes=$1, nom_schema=$2, x_debut=$3, x_fin=$4, y_debut=$5,
                    y_fin=$6, fake=$7, id_matiere=$8, schema_public=$9 WHERE id_schema=$10`,
                        [
                            JSON.stringify(req.body.legendes),
                            req.body.titre,
                            JSON.stringify(req.body.x_debut),
                            JSON.stringify(req.body.x_fin),
                            JSON.stringify(req.body.y_debut),
                            JSON.stringify(req.body.y_fin),
                            JSON.stringify(req.body.fake),
                            req.body.id_matiere,
                            req.body.public,
                            req.body.id])
                        .then((data) => {
                            console.log(data);
                            res.send("Ok");
                        })
                        .catch(err => {
                            res.sendStatus(500);
                            console.error(err);
                        });
                }).catch(err => {
                console.error(err);
                res.status(501);
            });
        } else res.status(501);
    });

    app.post('/ajoutMatiere', (req, res) => {
        if (req.cookies.user && cookies.has(req.cookies.user)) {
            hasPermission(cookies.get(req.cookies.user), 'create_matiere')
                .then(() => {
                    let nom = req.body.nom;
                    nom = nom.replace("'", "''");
                    pgsql.query(`INSERT INTO matiere(nom_matiere) VALUES ('${nom}') RETURNING id_matiere`)
                        .then(data => {
                            const id = data.rows[0].id_matiere;
                            let query = `INSERT INTO appartenir(id_matiere, email) VALUES (${id}, '${cookies.get(req.cookies.user)}')`;
                            let query2 = `INSERT INTO est_compris_dans(id_matiere, id_groupe) VALUES `;
                            if (req.body.liste)
                                req.body.liste.forEach(user => {
                                    query += `,(${id}, '${user}')`
                                });
                            pgsql.query(query)
                                .then(() => {
                                    res.send("Ok");
                                })
                                .catch(err => {
                                    res.sendStatus(500);
                                    console.error(err);
                                });
                            if (req.body.gliste) {
                                req.body.gliste.forEach(groupe => {
                                    query2 += `(${id}, ${groupe}),`
                                })
                                query2 = query2.slice(0, -1)
                                pgsql.query(query2)
                                    .catch(err => {
                                        console.error(err);
                                    });
                            }
                        })
                        .catch(err => {
                            res.sendStatus(500);
                            console.error(err);
                        });
                }).catch(err => {
                console.error(err);
                res.status(501);
            });
        } else
            res.status(501);
    });

    app.post('/editMatiere', (req, res) => {
        let query;
        if (req.cookies.user && cookies.has(req.cookies.user)) {
            hasPermission(cookies.get(req.cookies.user), 'create_matiere')
                .then(() => {
                    const id = req.body.id;
                    let nom = req.body.nom;
                    nom = nom.replace("'", "''");
                    pgsql.query(`UPDATE matiere SET nom_matiere='${nom}' WHERE id_matiere = ${id}`)
                        .then(() => {
                            res.send("Ok")
                        })
                        .catch(err => {
                            console.error(err);
                        });

                    if (req.body.ajouter) {
                        query = `INSERT INTO appartenir(id_matiere, email) VALUES `;
                        req.body.ajouter.forEach(user => {
                            query += `(${id}, '${user}'),`
                        });
                        query = query.slice(0, -1);
                        // enleve derniere virgule
                        pgsql.query(query)
                            .catch(err => {
                                console.error(err);
                            });
                    }

                    if (req.body.supprimer) {
                        query = `DELETE FROM appartenir WHERE id_matiere = ${id} AND email IN (`;
                        req.body.supprimer.forEach(user => {
                            query += `'${user}',`
                        });
                        query = query.slice(0, -1) + ')'
                        pgsql.query(query)
                            .catch(err => {
                                console.error(err);
                            });
                    }
                    if (req.body.ajouter_g) {
                        query = `INSERT INTO est_compris_dans(id_matiere, id_groupe) VALUES `;
                        req.body.ajouter_g.forEach(groupe => {
                            query += `(${id}, '${groupe}'),`
                        });
                        query = query.slice(0, -1);
                        // enleve derniere virgule
                        pgsql.query(query)
                            .catch(err => {
                                console.error(err);
                            });
                    }
                    if (req.body.supprimer_g) {
                        query = `DELETE FROM est_compris_dans WHERE id_matiere = ${id} AND id_groupe IN (`;
                        req.body.supprimer_g.forEach(groupe => {
                            query += `'${groupe}',`
                        });
                        query = query.slice(0, -1) + ')'
                        pgsql.query(query)
                            .catch(err => {
                                console.error(err);
                            });
                    }
                }).catch(err => {
                console.error(err);
                res.status(501);
            });
        } else
            res.status(401);
    });

    app.post('/deleteMatiere', (req, res) => {
        if (req.cookies.user && cookies.has(req.cookies.user)) {
            hasPermission(cookies.get(req.cookies.user), 'create_matiere')
                .then(() => {
                    const id = req.body.matiere;
                    pgsql.query(`DELETE FROM appartenir WHERE id_matiere = ${id}`)
                        .then(() => {
                            pgsql.query(`DELETE FROM est_compris_dans WHERE id_matiere = ${id}`)
                                .then(() => {
                                    pgsql.query(`DELETE FROM matiere WHERE id_matiere = ${id}`)
                                        .then(() => {
                                            res.send("Ok")
                                        })
                                        .catch(err => {
                                            console.error(err);
                                            res.status(500);
                                        });
                                })
                        })
                        .catch(err => {
                            console.error(err);
                            res.status(500);
                        });
                }).catch(err => {
                console.error(err);
                res.status(501);
            });
        } else
            res.status(401);
    })

    app.post('/deleteSchema', (req, res) => {
        if (req.cookies.user && cookies.has(req.cookies.user)) {
            const id = req.body.schema;
            pgsql.query(`DELETE FROM schema WHERE id_schema = ${id} AND email = '${cookies.get(req.cookies.user)}'`)
                .then(() => {
                    fs.unlinkSync(__dirname.replace('app', '') + '/images/' + id + '.jpg');
                    res.send("Ok");
                })
                .catch(err => {
                    console.error(err);
                    res.status(500);
                });
        } else
            res.status(401);
    })


    app.post('/ajoutGroup', (req, res) => {
        if (req.cookies.user && cookies.has(req.cookies.user)) {
            hasPermission(cookies.get(req.cookies.user), 'create_group')
                .then(() => {
                    let nom = req.body.nom;
                    nom = nom.replace("'", "''");
                    pgsql.query(`INSERT INTO groupe(nom_groupe) VALUES ('${nom}') RETURNING id_groupe`)
                        .then(data => {
                            const id = data.rows[0].id_groupe;
                            let query = `INSERT INTO est_relie(id_groupe, email) VALUES (${id}, '${cookies.get(req.cookies.user)}')`;
                            if (req.body.liste)
                                req.body.liste.forEach(user => {
                                    query += `,(${id}, '${user}')`
                                });
                            pgsql.query(query)
                                .then(() => {
                                    res.send("Ok");
                                })
                                .catch(err => {
                                    res.sendStatus(500);
                                    console.error(err);
                                });
                        })
                        .catch(err => {
                            res.sendStatus(500);
                            console.error(err);
                        });
                }).catch(err => {
                console.error(err);
                res.status(501);
            });
        } else
            res.status(501);
    });

    app.post('/editGroup', (req, res) => {
        let query;
        let query2;
        if (req.cookies.user && cookies.has(req.cookies.user)) {
            hasPermission(cookies.get(req.cookies.user), 'create_group')
                .then(() => {
                    let nom = req.body.nom;
                    nom = nom.replace("'", "''");
                    const id = req.body.id;
                    pgsql.query(`UPDATE groupe SET nom_groupe='${nom}' WHERE id_groupe = ${id}`)
                        .then(() => {
                            res.send("Ok")
                        })
                        .catch(err => {
                            console.error(err);
                        });

                    if (req.body.ajouter) {
                        query = `INSERT INTO est_relie(id_groupe, email) VALUES `;
                        req.body.ajouter.forEach(user => {
                            query += `(${id}, '${user}'),`
                        });
                        query = query.slice(0, -1);
                        // enleve derniere virgule
                        pgsql.query(query)
                            .catch(err => {
                                console.error(err);
                            });
                    }

                    if (req.body.supprimer) {
                        query = `DELETE FROM est_relie WHERE id_groupe = ${id} AND email IN (`;
                        req.body.supprimer.forEach(user => {
                            query += `'${user}',`
                        });
                        query = query.slice(0, -1) + ')'
                        pgsql.query(query)
                            .catch(err => {
                                console.error(err);
                            });
                        query2 = `DELETE FROM est_compris_dans WHERE id_groupe = ${id} AND id_matiere IN (`;
                        req.body.supprimer.forEach(user => {
                            query2 += `'${user}',`
                        });
                        query2 = query2.slice(0, -1) + ')'
                        pgsql.query(query)
                            .catch(err => {
                                console.error(err);
                            });
                    }
                }).catch(err => {
                console.error(err);
                res.status(501);
            });
        } else
            res.status(401);
    });

    app.post('/deleteGroup', (req, res) => {
        if (req.cookies.user && cookies.has(req.cookies.user)) {
            hasPermission(cookies.get(req.cookies.user), 'create_group')
                .then(() => {
                    const id = req.body.groupe;
                    pgsql.query(`DELETE FROM est_relie WHERE id_groupe = ${id}`)
                        .then(() => {
                            pgsql.query(`DELETE FROM groupe WHERE id_groupe = ${id}`)
                                .then(() => {
                                    res.send("Ok")
                                })
                                .catch(err => {
                                    console.error(err);
                                    res.status(500);
                                });
                        })
                        .catch(err => {
                            console.error(err);
                            res.status(500);
                        });
                }).catch(err => {
                console.error(err);
                res.status(501);
            });
        } else
            res.status(401);
    })
}