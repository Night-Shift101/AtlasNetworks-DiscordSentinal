const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { handleBlockedAction } = require('../../utils/blockHandler.js');

const filePath = path.join(__dirname, '../../utils/departments.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('departmentcreate')
        .setDescription('Creates a new department or sub-department')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Name of the department')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('sub_department')
                .setDescription('Is this a sub-department?')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('main_department')
                .setDescription('Main department ID (only if sub-department)')
                .setRequired(false))
        ,

    async execute(config, interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({ content: 'You must be an administrator to run this command.', ephemeral: true });
        }

        const isSub = interaction.options.getBoolean('sub_department');
        const parentId = interaction.options.getString('main_department');
        const name = interaction.options.getString('name');

        const id = name.toUpperCase().replace(/\s+/g, '-'); // ID-friendly version

        let departments = [];
        try {
            if (fs.existsSync(filePath)) {
                departments = JSON.parse(fs.readFileSync(filePath, 'utf8')).departments || [];
            }
        } catch (err) {
            console.error('[Error] Failed to read departments file:', err);
            return await interaction.reply({ content: 'Failed to load department data.', ephemeral: true });
        }

        if (departments.find(dep => dep.id === id)) {
            return await interaction.reply({ content: `A department with ID "${id}" already exists.`, ephemeral: true });
        }

        if (isSub && !departments.find(dep => dep.id === parentId)) {
            return await interaction.reply({ content: `Main department "${parentId}" not found.`, ephemeral: true });
        }

        const newDept = {
            id,
            name,
            color: '#000000', // default, editable later
            hierarchy: [],
            roles: [],
            subDepartments: [],
            isSubDepartment: isSub,
            ...(isSub ? { parent: parentId } : {})
        };

        departments.push(newDept);

        try {
            fs.writeFileSync(filePath, JSON.stringify({ departments }, null, 2));
        } catch (err) {
            console.error('[Error] Failed to write to departments file:', err);
            return await interaction.reply({ content: 'Failed to save department.', ephemeral: true });
        }

        await interaction.reply({
            content: `✅ Department **${name}** (${id}) has been created${isSub ? ` under **${parentId}**` : ''}.`,
            ephemeral: false
        });
    }
};
