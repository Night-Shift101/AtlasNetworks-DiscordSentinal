const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(config, client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);

        for (const [guildId, guild] of client.guilds.cache) {
            if (config.generalSettings.autorizedGuilds.includes(guild.id)) {
                console.log(`[Authorized] Staying in guild: ${guild.name}`);
            } else {
                console.error(`[Unauthorized] Leaving unauthorized guild: ${guild.name}`);
                try {
                    await guild.leave();
                    console.log(`[Success] Left unauthorized guild: ${guild.name}`);
                } catch (leaveError) {
                    console.error(`[Error] Unable to leave unauthorized guild: ${guild.name} (${guild.id})`);
                    try {
                        const mainGuild = await client.guilds.fetch('1323763034488963143');
                        const logChannel = await mainGuild.channels.fetch('1362919928356667462');
                        if (logChannel) {
                            await logChannel.send(`⚠️ Unable to leave unauthorized guild: ${guild.name} (${guild.id})`);
                            console.log(`[Management Notified] Reported unauthorized guild to management channel.`);
                        }
                    } catch (notifyError) {
                        console.error(`[Notify Error] Failed to notify management: ${notifyError.message}`);
                    }
                }
            }
        }

        console.log(`[Startup] Fetching all members into cache for authorized guilds...`);
        for (const [guildId, guild] of client.guilds.cache) {
            if (config.generalSettings.autorizedGuilds.includes(guild.id)) {
                try {
                    await guild.members.fetch();
                    console.log(`[Startup] Successfully cached members for guild: ${guild.name}`);
                } catch (fetchError) {
                    console.error(`[Startup Error] Failed to fetch members for ${guild.name}: ${fetchError.message}`);
                }
            }
        }
        console.log(`[Startup] All authorized guild members cached successfully.`);
    },
};
