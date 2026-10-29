---
title: "Open your first project and document"
description: "Walks through first use after installation and login: add a server working folder with the current project selector in the header, create and edit notes.md with autosave, then check the tools and Git changes."
created: "2026-10-14"
updated: "2026-10-19"
상위파일: "MOC.md"
---
# Open your first project and document

Start with installation complete and logged in to mew. By the end of this guide, you will have created `notes.md` in your working folder and reviewed your changes. If you have not installed it yet, follow the [Korean getting started guide](getting-started-ko.md).

## 1. Open a working folder

Click the **current project icon and name** on the left side of the header, then select **Add Project** at the bottom of the list. Navigate to a working folder on the server computer and click **Open Current Folder** (owner). These are **files on the mew server**. To get started, you can create an example folder such as `hello-mew` in the folder picker. Once you switch to the selected folder, the header displays that project's icon and name.

To switch projects, click the current project in the header and select one from the list. Permissions to open folders and access features vary by account role. [Project management](projects.md#프로젝트-탭).

## 2. Distinguish files from Documents

Select a file from the project folder in **Files** on the left. **Documents** shows the Documents folder linked to that project. Both open in the same editor; switching views alone does not copy files.

If you have no Markdown files, click **New File** in the **Files** view. Enter a name including its extension, such as `notes.md`, and press Enter to create the file. If a folder is selected, the file is created inside it; if a file is selected, it is created in the same folder as that file. With no selection, it is created in the project root. To link an existing document folder, follow [Documents setup](project-setup.md).

## 3. Edit Markdown

![Editing example project notes in Hotview](../assets/screenshots/desktop.png)

Try writing a heading and checklist as follows.

```markdown
# 프로젝트 노트

## 할 일

- [ ] 요구사항 정리
- [ ] 첫 변경 검토
```

Edit the rendered content in **Hotview** and use the **Plain** button to view the Markdown source. Once saving is complete, open another file, then return to `notes.md` to confirm the content remains. Content is saved automatically; `Ctrl+S` commits the current file to Git. Before recording change history or reverting a file, review [save and restore behavior](editor.md#autosave-commits-and-file-history).

## 4. Open the tools you need

On a PC, click **Agents**, **Terminal**, **Git**, or other tools in the left dock. You can close tools or rearrange them, and dragging a document tab to the edge of an editor pane splits the screen. If the icon you want is missing, check the visibility settings in **Settings → Dock** and your account's feature permissions.

For AI agents, first complete [runtime installation and authentication](../configuration/agent-runtimes.md). Terminals and agents run with the permissions of the server's OS account. [Using the terminal](terminal-agents.md) · [Security and roles](../operations/security.md).

On a phone, use the bottom dock to switch the foreground panel. On narrow screens, select a document in the file list to move to the editor.

## 5. Review changes

If the project is a Git repository, click `notes.md` in the **Git** panel to review the diff. To record the changes in history, select the file's checkbox, click the commit icon, enter a title, and commit. Connect GitHub to your Mew account when making your first commit. Folders that are not Git repositories can also be used for document editing. [Git work panel](projects.md#git-operations-panel).

## Next steps

| What to do next | Guide |
| --- | --- |
| Connect from a phone or another computer | [External access with Mewlink](getting-started-ko.md#connect-remotely) |
| Link folders and configure default agent instructions | [Project setup](project-setup.md) |
| Work on documents with others | [Collaboration, comments, and sharing](collaboration.md) |
| Change search, theme, and account settings | [Settings home](../configuration/MOC.md) |
| Find instructions for a specific feature | [User guide home](MOC.md) |
