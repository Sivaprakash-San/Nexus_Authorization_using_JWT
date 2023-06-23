const { PrismaClient } = require('@prisma/client');
const { queryType, mutationType, stringArg, makeSchema, objectType, nonNull } = require('nexus');
const { ApolloServer, AuthenticationError } = require('apollo-server');
const DataLoader = require('dataloader');
const { setFields, setArrayFields } = require('./dataloader');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

const clientLoader = new DataLoader(async(ids) => {
    const clients = await prisma.client.findMany({
        where: {
            id: {
                in: ids,
            },
        },
    });
    return setFields(clients, ids);
}, {cache: true});

const profileLoader = new DataLoader(async(ids) => {
    const profiles = await prisma.profile.findMany({
        where: {
            client_id: {
                in: ids,
            },
        },
    });
    return setArrayFields(profiles, ids, "client_id")
}, {cache: true});

const client = objectType({
    name: 'client',
    definition(t){
        t.string('id');
        t.string('name');
        t.string('email');
        t.list.field('profile', {
            type: 'profile',
            resolve: (parent, _args) => {
                return profileLoader.load(parent.id);
            }
        });
    },
});

const profile = objectType({
    name: 'profile',
    definition(t) {
        t.string('id');
        t.string('bio');
        t.boolean('is_deleted');
        t.string('client_id');
        t.field('client', {
            type: 'client',
            resolve: (parent, _args) => {
                return clientLoader.load(parent.client_id);
            },
        })
    }
})

const query = queryType({
    definition(t) {
        t.field('singleClient', {
            type: 'client',
            args: {
                id: nonNull(stringArg()),
            },
            resolve: (_, args) => {

                return prisma.client.findUnique({
                    where: {
                        id: args.id,
                    },
                    
                });
            }
        })

        t.list.field('manyClients', {
            type: 'client',
            resolve: () => {
                return prisma.client.findMany();
            },
        });

        t.field('singleProfile', {
            type: 'profile',
            args: {
                id: nonNull(stringArg()),
            },
            resolve: (_, args,context) => {
                if(!isUser(_,args,context)){
                    return "authorization failed";
                }
                return prisma.profile.findUnique({
                    where: {
                        id: args.id,
                    },
                });
            },
        });

        t.list.field('manyProfiles', {
            type: 'profile',
            resolve: () => {
                return prisma.profile.findMany({
                    where:{
                        is_deleted:false,
                    }
                });
            },
        });
    },
});

const mutation = mutationType({
    definition(t){
        t.field('createClient', {
            type: 'client',
            args: {
                name: nonNull(stringArg()),
                email: nonNull(stringArg())
            },
            resolve: async (_parent, args) => {
                return prisma.client.create({
                    data: {
                        name: args.name,
                        email: args.email,
                    },
                });
            },
        });

        t.field('createProfile', {
            type: 'profile',
            args: {
                bio:nonNull(stringArg()),
                client_id: nonNull(stringArg()),
            },
            resolve: (_parent, args) => {
                return prisma.profile.create({
                    data: {
                        bio: args.bio,
                        client: {
                            connect: {
                                id: args.client_id,
                            }
                        },
                    },
                });
            },
        });

        t.field('deleteClient', {
            type: 'client',
            args: {
                id: nonNull(stringArg()),
            },
            resolve: (_, args) => {
               return prisma.client.delete({
                    where: {
                        id: args.id,
                    },
                });  
            }
        });

        t.field('deleteProfile', {
            type: 'profile',
            args: {
                id: nonNull(stringArg()),
            },
            resolve: (_, args, context) => {
                if(!isAdmin(_,args,context)){
                    return "authorization failed";
                }
                return prisma.profile.delete({
                    where: {
                        id: args.id,
                    },
                });
            },
        });

        t.field('updateClient', {
            type: 'client',
            args: {
                id: nonNull(stringArg()),
                data: nonNull(stringArg()),
            },
            resolve: (_, args) => {
                clientLoader.clear(args.id);
                return prisma.client.update({
                    where: {
                        id: args.id,
                    },
                    data: {
                        name: args.data
                    },
                })
            }
        })

        t.field('updateProfile', {
            type: 'profile',
            args: {
                id: nonNull(stringArg()),
                data: nonNull(stringArg()),
            },
            resolve: (_, args) => {
                profileLoader.clear(args.id);
                return prisma.profile.update({
                    where: {
                        id: args.id,
                    },
                    data: {
                        bio: args.data
                    },
                })
            }
        })

        t.field('upsertProfile', {
            type: 'profile',
            args: {
                id: nonNull(stringArg()),
                bio: nonNull(stringArg()),
                client_id: nonNull(stringArg()),
            },
            resolve: (_, args) => {
                clientLoader.clear(args.id);
                return prisma.profile.upsert({
                    where:{
                        id: args.id,
                    },
                    create: {
                        bio: args.bio,
                        client: {
                            connect: {
                                id: args.client_id,
                            }
                        }
                    },
                    update: {
                        bio: args.bio,
                    },

                })
            },
        });

        t.field('softDeleteProfile', {
            type: 'profile',
            args: {
                id: nonNull(stringArg()),
            },
            resolve:async (_, args) => {
                return await prisma.profile.update({
                    where:{
                        id: args.id,
                    },
                    data: {
                        is_deleted: true,
                    },
                });
            },
        });
    },
});


async function retrieve(){
    const user = await prisma.$queryRaw `SELECT * FROM profile;`;
    user.forEach(i => {
        console.log("bio:",i.bio);
    });
}
// retrieve()











const user = {
    id: "ndncsnc", name: "dharun", role: "admin"
}

const secretKey = 'kudhfgiudrh';
const expiresIn = '10m'; 

const generateToken = async(user) => {
    const token = await jwt.sign(user, secretKey, { expiresIn });
    console.log(token)
    return token;
};

generateToken(user);

const isUser = (_, args, context) => {
    const token = context.req.headers.token;
    try {
        const decoded = jwt.verify(token, secretKey);
        return decoded
    } catch (error) {
        throw new AuthenticationError('Invalid or expired token');
    }
}

const isAdmin = (_, args, context) => {
    const token = context.req.headers.token;
    try {
        const decoded = jwt.verify(token, secretKey);
        console.log(token);
        if(decoded.role == "admin"){
            return decoded
        }
    } catch (error) {
        throw new AuthenticationError('Invalid or expired token');
    }
}













const schema = makeSchema({
    types: [client, profile, query, mutation]
});

const server = new ApolloServer({ 
    schema,
    context: ({ req }) => ({
        req: req,
    }),
    clientLoader,
    profileLoader,
})


server.listen(5000, () => {
    console.log("running on 5000");
});