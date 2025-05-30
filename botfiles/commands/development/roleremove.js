const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { handleBlockedAction } = require('../../utils/blockHandler.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roleremove')
        .setDescription('Removes role in all discords')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to remove the role from')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to remove in all servers')
                .setRequired(true)),
    async execute(config, interaction) {
        const linkedRoles = require('./linkedRoles.json');

        if (interaction.guild.id !== "1323763034488963143") {
            return await interaction.reply({
                content: "That command can only be executed in the main server.",
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user');
        const targetRole = interaction.options.getRole('role');

        let linkFound = null;
        let roleFound = false;

        for (const link of linkedRoles.links) {
            for (const roleObj of link.roles) {
                if (roleObj.guildId === interaction.guild.id && roleObj.roleId === targetRole.id) {
                    linkFound = link;
                    roleFound = true;
                    break;
                }
            }
            if (roleFound) break;
        }

        if (!roleFound) {
            return await interaction.reply({
                content: `❌ This role is not linked to any network role group.`,
                ephemeral: true
            });
        }

        if (!interaction.member.roles.cache.has(linkFound.permissionRole)) {
            console.log(`[Debug] User ${interaction.user.tag} tried to use /roleremove without required role!`);
            await handleBlockedAction(
                interaction.client,
                interaction.user,
                `Attempted to remove **${targetRole.name}** from **${targetUser.username}** without the required role: <@&${linkFound.permissionRole}>`,
                interaction.guild.id
            );

            return await interaction.reply({
                content: `❌ You do not have the required role to remove **${targetRole.name}**.\n\nRequired role: <@&${linkFound.permissionRole}>`,
                ephemeral: true
            });
        }

        const confirmationRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm')
                    .setLabel('✅ Confirm Role Removal')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger),
            );

        await interaction.reply({
            content: `⚠️ **Confirmation Required** ⚠️\n\nYou are about to remove the role **${targetRole.name}** from **${targetUser.username}** across all linked servers.\n\n**Reminder:** Misusing this command is against **Atlas Networks' Policy** and will result in **disciplinary action**.\n\nPlease confirm your action below:`,
            components: [confirmationRow],
            ephemeral: true,
        });

        const filter = i => 
            i.user.id === interaction.user.id && 
            (i.customId === 'confirm' || i.customId === 'cancel');

        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000, max: 1 });

        collector.on('collect', async i => {
            if (i.customId === 'cancel') {
                await i.update({ content: '❌ Action canceled.', components: [] });
                return;
            }

            if (i.customId === 'confirm') {
                await i.update({ content: `🔄 Starting role removal for **${targetUser.username}**...`, components: [] });

                let successCounter = 0;
                let failureCounter = 0;
                const errors = [];

                const promises = linkFound.roles.map(async (roleInfo) => {
                    try {
                        const guild = await interaction.client.guilds.fetch(roleInfo.guildId).catch(() => null);
                        if (!guild) {
                            errors.push(`❌ Failed to fetch guild ID \`${roleInfo.guildId}\``);
                            failureCounter++;
                            return;
                        }

                        const member = await guild.members.fetch(targetUser.id).catch(() => null);
                        if (!member) {
                            errors.push(`❌ ${targetUser.username} not found in **${guild.name}**`);
                            failureCounter++;
                            return;
                        }

                        const role = guild.roles.cache.get(roleInfo.roleId);
                        if (!role) {
                            errors.push(`❌ Role not found in **${guild.name}**`);
                            failureCounter++;
                            return;
                        }

                        await member.roles.remove(role);
                        successCounter++;
                    } catch (err) {
                        console.error(`Error in guild ${roleInfo.guildId}:`, err);
                        errors.push(`❌ \`${err.message}\` in guild ID \`${roleInfo.guildId}\``);
                        failureCounter++;
                    }
                });

                await Promise.all(promises);

                const summary = `✅ Role removed in **${successCounter}** server(s).\n❌ Failed in **${failureCounter}** server(s).`;

                const fullMessage = errors.length > 0
                    ? `${summary}\n\nErrors:\n${errors.join("\n")}`
                    : summary;

                return await interaction.followUp({ content: fullMessage, ephemeral: true });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({ content: '⏳ Confirmation timed out. No action was taken.', components: [] });
            }
        });
    }
};