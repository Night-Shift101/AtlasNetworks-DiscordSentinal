const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { handleBlockedAction } = require('../../utils/blockHandler.js'); // <-- Added
const config = require('../../config.json'); // <-- Load config

const roleRulesPath = path.join(__dirname, '..', '..', 'roleRules.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('editrolerules')
        .setDescription('Add or remove roles and rules from the roleRules.json file')
        .addSubcommand(subcommand =>
            subcommand
                .setName('addrole')
                .setDescription('Add a new role entry')
                .addRoleOption(option => 
                    option.setName('role')
                        .setDescription('Role to add')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('removerole')
                .setDescription('Remove a role entry')
                .addRoleOption(option => 
                    option.setName('role')
                        .setDescription('Role to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('addrule')
                .setDescription('Add a rule to an existing role')
                .addRoleOption(option => 
                    option.setName('role')
                        .setDescription('Role to modify')
                        .setRequired(true))
                .addStringOption(option => 
                    option.setName('rule')
                        .setDescription('Rule type (denyDirectChange or allowedRoles)')
                        .setRequired(true))
                .addStringOption(option => 
                    option.setName('value')
                        .setDescription('Value for the rule (true/false or role ID)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('removerule')
                .setDescription('Remove a rule from an existing role')
                .addRoleOption(option => 
                    option.setName('role')
                        .setDescription('Role to modify')
                        .setRequired(true))
                .addStringOption(option => 
                    option.setName('rule')
                        .setDescription('Rule type to remove (denyDirectChange or allowedRoles)')
                        .setRequired(true))),
    
    async execute(config, interaction) {
        const subcommand = interaction.options.getSubcommand();

        const permissionRoles = config.editRoleRulesPermissions?.[interaction.guild.id];

        if (!permissionRoles || !Array.isArray(permissionRoles)) {
            return await interaction.reply({ content: `❌ No permission roles configured for this server. Please contact an administrator.`, ephemeral: true });
        }

        const hasPermission = interaction.member.roles.cache.some(role => permissionRoles.includes(role.id));

        if (!hasPermission) {
            await handleBlockedAction(
                interaction.client,
                interaction.user,
                `Attempted to use **/editrolerules** without required permission roles.`,
                interaction.guild.id
            );

            const readableRoles = permissionRoles.map(rid => `<@&${rid}>`).join(', ');

            return await interaction.reply({
                content: `❌ You do not have permission to use this command.\nRequired role(s): ${readableRoles}`,
                ephemeral: true
            });
        }

        let roleRules;
        try {
            roleRules = JSON.parse(fs.readFileSync(roleRulesPath, 'utf8'));
        } catch (error) {
            console.error("Failed to read roleRules.json:", error);
            await interaction.reply({ content: "❌ Could not read roleRules.json.", ephemeral: true });
            return;
        }

        const role = interaction.options.getRole('role');
        if (!role) {
            await interaction.reply({ content: "❌ Role not found.", ephemeral: true });
            return;
        }

        const roleId = role.id;

        switch (subcommand) {
            case 'addrole':
                if (roleRules[roleId]) {
                    await interaction.reply({ content: `❌ Role **${role.name}** already exists in the rules.`, ephemeral: true });
                    return;
                }
                roleRules[roleId] = {};
                break;

            case 'removerole':
                if (!roleRules[roleId]) {
                    await interaction.reply({ content: `❌ Role **${role.name}** does not exist in the rules.`, ephemeral: true });
                    return;
                }
                delete roleRules[roleId];
                break;

            case 'addrule':
                if (!roleRules[roleId]) {
                    roleRules[roleId] = {};
                }
                const ruleType = interaction.options.getString('rule');
                const ruleValue = interaction.options.getString('value');

                if (ruleType === "denyDirectChange") {
                    roleRules[roleId][ruleType] = (ruleValue.toLowerCase() === "true");
                } else if (ruleType === "allowedRoles") {
                    if (!roleRules[roleId][ruleType]) {
                        roleRules[roleId][ruleType] = [];
                    }
                    roleRules[roleId][ruleType].push(ruleValue);
                } else {
                    await interaction.reply({ content: "❌ Unknown rule type.", ephemeral: true });
                    return;
                }
                break;

            case 'removerule':
                if (!roleRules[roleId]) {
                    await interaction.reply({ content: `❌ Role **${role.name}** does not exist in the rules.`, ephemeral: true });
                    return;
                }
                const removeRuleType = interaction.options.getString('rule');

                if (removeRuleType in roleRules[roleId]) {
                    delete roleRules[roleId][removeRuleType];
                } else {
                    await interaction.reply({ content: `❌ Rule **${removeRuleType}** does not exist for **${role.name}**.`, ephemeral: true });
                    return;
                }
                break;
        }

        try {
            fs.writeFileSync(roleRulesPath, JSON.stringify(roleRules, null, 4));
            await interaction.reply({ content: "✅ Successfully updated roleRules.json!", ephemeral: true });
        } catch (error) {
            console.error("Failed to save roleRules.json:", error);
            await interaction.reply({ content: "❌ Failed to save changes to roleRules.json.", ephemeral: true });
        }
    }
};
