const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const networkConfig = require('./networkConfig.json');

let dynamicSubDepartments = []; // Cached sub-department data

async function generateSubDepartments(client) {
    const temp = [];

    for (const [guildId, guild] of client.guilds.cache) {
        const roles = guild.roles.cache
            .sort((a, b) => b.position - a.position)
            .map(role => role.name);

        let insideSection = false;
        let currentSectionRoles = [];

        for (const roleName of roles) {
            if (roleName === '--------------------') {
                if (insideSection && currentSectionRoles.length > 1) {
                    const firstFewRoles = currentSectionRoles.slice(0, 3);
                    const validSubDept = firstFewRoles.every(name => name.includes(' | '));

                    if (validSubDept) {
                        const fullName = currentSectionRoles[currentSectionRoles.length - 1];
                        const topRole = currentSectionRoles[0];
                        const abbreviation = topRole.split(' | ')[0];

                        temp.push({
                            guildName: guild.name,
                            abbreviation: abbreviation,
                            fullName: fullName
                        });
                    }
                }
                insideSection = true;
                currentSectionRoles = [];
            } else if (insideSection) {
                currentSectionRoles.push(roleName);
            }
        }
    }

    dynamicSubDepartments = temp;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Fetch a user\'s full network profile')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to fetch the profile for')
                .setRequired(true)),

    async execute(config, interaction) {
        const targetUser = interaction.options.getUser('user');
        const client = interaction.client;

        if (dynamicSubDepartments.length === 0) {
            await generateSubDepartments(client);
            console.log(`[SubDeptScanner] Sub-departments generated.`);
        }

        const networkGuilds = networkConfig.networkGuilds;
        const departmentRoles = networkConfig.departmentRoles;

        const skipRolePatterns = [
            "--------------------", "Vacant", "Office Key", "Root Administrator",
            "Bot Permissions", "Wick", "Tebex", "Atlas Network Community Sync",
            "Server Announcements", "Roleplay Announcements", "Console", "Dyno",
            "Ticket Tool", "Clockin", "carl-bot", "Member"
        ];

        const staffRanks = [
            "Executive", "Director", "Supervisor", "Division Leader", "Head Administrator", "Senior Administrator",
            "Administrator", "Senior Moderator", "Moderator", "Trial Moderator", "Staff Trainee"
        ];
        const staffSubDepartments = [
            "Internal Affairs", "Gamemaster", "Recruitment", "Infrastructure"
        ];
        const developmentRanks = [
            "Head of Development", "Senior Developer", "Developer", "Trial Developer", "AN | Development Team"
        ];
        const donatorRanks = [
            "X | Elite Class", "U | Upper Class", "M | Middle Class", "L | Lower Class", "Server Booster"
        ];
        const governmentRanks = [
            "Governor", "Vice Governor", "Mayor", "San Andreas Government"
        ];

        await interaction.deferReply({ ephemeral: true });

        const serversIn = [];
        const departmentProfile = {};
        const mainServerExtras = {
            staffRank: null,
            staffSubDepartments: [],
            developmentRank: null,
            donatorRank: null,
            governmentRank: null
        };

        for (const guildId of networkGuilds) {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) continue;

            const member = await guild.members.fetch(targetUser.id).catch(() => null);
            if (!member) continue;

            serversIn.push(guild.name);

            const roles = [...member.roles.cache.values()]
                .filter(role => role.name !== '@everyone')
                .filter(role => !skipRolePatterns.some(pattern => role.name.includes(pattern)))
                .sort((a, b) => b.position - a.position);

            const sanGovRole = roles.find(r => r.name === "San Andreas Government");

            if (guildId === "1323763034488963143") {
                for (const role of roles) {
                    if (staffRanks.includes(role.name) && !mainServerExtras.staffRank) {
                        mainServerExtras.staffRank = role.name;
                        continue;
                    }
                    for (const dept of staffSubDepartments) {
                        if (role.name.includes(dept) && !mainServerExtras.staffSubDepartments.includes(dept)) {
                            mainServerExtras.staffSubDepartments.push(dept);
                        }
                    }
                    if (developmentRanks.includes(role.name) && !mainServerExtras.developmentRank) {
                        mainServerExtras.developmentRank = role.name;
                        continue;
                    }
                    if (donatorRanks.includes(role.name) && !mainServerExtras.donatorRank) {
                        mainServerExtras.donatorRank = role.name;
                        continue;
                    }
                    if (governmentRanks.includes(role.name) && !mainServerExtras.governmentRank) {
                        mainServerExtras.governmentRank = role.name;
                        continue;
                    }
                }
            }

            let foundDepartment = findUserDepartment(member, departmentRoles);

            if (!foundDepartment) continue;

            if (!departmentProfile[foundDepartment]) departmentProfile[foundDepartment] = {};

            for (const role of roles) {
                // Dynamic Sub-Departments Matching
                const match = dynamicSubDepartments.find(d =>
                    role.name.startsWith(d.abbreviation) && d.guildName === guild.name
                );

                if (match) {
                    if (!departmentProfile[foundDepartment][match.fullName]) {
                        departmentProfile[foundDepartment][match.fullName] = role.name.split(' | ')[1] || role.name;
                    }
                    continue;
                }

                // General Ranks (Position between Department role and Government role)
                if (sanGovRole) {
                    const deptRole = member.roles.cache.find(r => r.name === getDepartmentRoleByName(foundDepartment, departmentRoles));
                    if (deptRole && role.position < deptRole.position && role.position > sanGovRole.position) {
                        if (!departmentProfile[foundDepartment]['General']) {
                            departmentProfile[foundDepartment]['General'] = role.name;
                        }
                    }
                }
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`📋 Network Profile: ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setColor(mainServerExtras.staffRank ? 'Red' : mainServerExtras.developmentRank ? 'Purple' : 'Blue')
            .setFooter({ text: 'Atlas Network • Profile System' })
            .setTimestamp()
            .addFields(
                { name: '🧑‍💻 Username', value: targetUser.username, inline: true },
                { name: '🆔 Discord ID', value: targetUser.id, inline: true },
                { name: '🌐 Servers in Network', value: serversIn.length > 0 ? serversIn.join('\n') : "None", inline: false }
            );

        if (mainServerExtras.staffRank) {
            embed.addFields({ name: '👮 Staff Rank', value: mainServerExtras.staffRank, inline: true });
        }
        if (mainServerExtras.staffSubDepartments.length > 0) {
            embed.addFields({ name: '📂 Staff Sub-Departments', value: mainServerExtras.staffSubDepartments.join(', '), inline: false });
        }
        if (mainServerExtras.developmentRank) {
            embed.addFields({ name: '🛠️ Development Rank', value: mainServerExtras.developmentRank, inline: true });
        }
        if (mainServerExtras.donatorRank) {
            embed.addFields({ name: '💸 Donator Rank', value: mainServerExtras.donatorRank, inline: true });
        }
        if (mainServerExtras.governmentRank) {
            embed.addFields({ name: '🏛️ Government Rank', value: mainServerExtras.governmentRank, inline: true });
        }

        for (const [mainDept, subDepts] of Object.entries(departmentProfile)) {
            let deptText = "";

            for (const [subDept, rank] of Object.entries(subDepts)) {
                deptText += `➔ **${subDept}**: ${rank}\n`;
            }

            embed.addFields({
                name: `🏢 ${mainDept}`,
                value: deptText || "None",
                inline: false
            });
        }

        return await interaction.editReply({ embeds: [embed] });
    }
};

function findUserDepartment(member, departmentRoles) {
    const deptRole = member.roles.cache.find(r => departmentRoles[r.name]);
    return deptRole ? departmentRoles[deptRole.name] : null;
}

function getDepartmentRoleByName(name, departmentRoles) {
    for (const [roleName, deptName] of Object.entries(departmentRoles)) {
        if (deptName === name) return roleName;
    }
    return null;
}
