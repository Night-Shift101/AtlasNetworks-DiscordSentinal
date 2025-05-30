const { Events, MessageFlags } = require('discord.js');
const { blockedUsers, activeEscalations } = require('../utils/blockHandler.js');

module.exports = {
	name: 'safeInteractionCreate',
	async execute(config, interaction) {
		if (interaction.isButton()) {
			if (interaction.customId.startsWith('cancel_timeout_')) {
				const userId = interaction.customId.split('_')[2];
				const guild = interaction.guild;
				const member = await guild.members.fetch(interaction.user.id).catch(() => null);

				if (!member) {
					return interaction.reply({ content: '⚠️ Could not verify your permissions.', ephemeral: true });
				}

				const configData = require('../config.json');
				const staffRoleId = configData.staffRoles?.[guild.id];

				if (!staffRoleId || !member.roles.cache.has(staffRoleId)) {
					return interaction.reply({ content: '⚠️ You do not have permission to cancel timeouts.', ephemeral: true });
				}

				if (blockedUsers.has(userId)) {
					blockedUsers.delete(userId);
					activeEscalations.delete(userId);
					console.log(`[Security] Timeout manually cancelled for user ID ${userId}`);
					await interaction.reply({ content: `✅ Timeout for <@${userId}> has been successfully cancelled.`, ephemeral: false });
				} else {
					await interaction.reply({ content: `⚠️ No active timeout found for <@${userId}>.`, ephemeral: true });
				}
			}
		} else if (interaction.isChatInputCommand()) {

			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			try {
				await command.execute(config, interaction);
			} catch (error) {
				console.error(error);
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
				} else {
					await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
				}
			}
		}
	},
};