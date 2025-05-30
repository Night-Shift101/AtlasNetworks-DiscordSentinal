const { SlashCommandBuilder } = require('discord.js');
const linkedRoles = require('./linkedRoles.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listlinks')
        .setDescription('Lists all linked role names from the linkedRoles.json file'),

    async execute(config, interaction) {
        if (!linkedRoles.links || linkedRoles.links.length === 0) {
            return await interaction.reply("❌ No linked roles found in the configuration.");
        }

        const names = linkedRoles.links.map(link => `• ${link.readableName}`);

        const message = `🔗 **Linked Roles**:\n\n${names.join('\n')}`;

        await interaction.reply({
            content: message,
            ephemeral: true // So only the command user sees it
        });
    }
};