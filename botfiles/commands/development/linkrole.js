const { fail } = require('assert');
const { SlashCommandBuilder, AutoModerationRuleKeywordPresetType } = require('discord.js');
const { link } = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('linkrole')
        .setDescription('Finds roles with the same name across all servers and outputs them as JSON')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to search by name across all guilds')
                .setRequired(true)),

    async execute(config, interaction) {
        const targetRole = interaction.options.getRole('role');
        const roleName = targetRole.name;

        await interaction.reply(`🔍 Searching for roles named **${roleName}** across all servers...`);

        const matchedRoles = [];

        const guilds = interaction.client.guilds.cache;

        for (const [guildId, guild] of guilds) {
            try {
                const fullGuild = await interaction.client.guilds.fetch(guildId);
                const roles = await fullGuild.roles.fetch();

                const match = roles.find(role => role.name === roleName);
                if (match) {
                    matchedRoles.push({
                        guildId: fullGuild.id,
                        roleId: match.id
                    });
                }
            } catch (err) {
                console.error(`❌ Error accessing guild ${guildId}:`, err);
                // Optional: log to mod channel or continue silently
            }
        }

        const jsonOutput = 
                {
                    readableName: roleName,
                    roles: matchedRoles
                };

        // Send as code block to avoid formatting issues
        await interaction.followUp({
            content: "```json\n" + JSON.stringify(jsonOutput, null, 4) + "\n```",
            ephemeral: true // Only visible to the user
        });
    }
};