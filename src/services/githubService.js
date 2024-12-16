import { DB_NAME, DB_VERSION, TABS_STORE, TODO_STORE, openDB } from '../utils/db';

class GitHubService {
  constructor() {
    this.syncInterval = 30 * 60 * 1000; // 30 minutes
    this.loadSettings();
    this.startAutoSync();
  }

  loadSettings() {
    this.settings = {
      token: localStorage.getItem('github_token'),
      repo: localStorage.getItem('github_repo'),
      branch: localStorage.getItem('github_branch') || 'main'
    };
  }

  startAutoSync() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
    }
    
    this.autoSyncTimer = setInterval(() => {
      this.syncAllFiles();
    }, this.syncInterval);
  }

  stopAutoSync() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  isConfigured() {
    const isConfigured = !!(this.settings.token && this.settings.repo);
    return isConfigured;
  }

  getFilePath(filename) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    let extension = '';
    
    // Handle file extensions
    if (!filename.includes('.')) {
      extension = '.md';
    } else if (filename.endsWith('.tldraw')) {
      extension = ''; // Don't add extension for .tldraw files
    }
    
    return `${year}/${month}/${filename}${extension}`;
  }

  getTodoFilePath() {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.toLocaleString('en-US', { month: 'short' }).toLowerCase();
    return `todo/todo-${month}-${year}.md`;
  }

  shouldSyncFile(filename) {
    // Skip untitled.md files
    if (filename === 'untitled.md' || filename.startsWith('Note') || filename.startsWith('Code')) {
      return false;
    }
    
    // Special case for todos file
    if (filename === 'Todo') {
      return true;
    }
    
    // Include .md and .tldraw files
    const shouldSync = filename.endsWith('.md') || filename.endsWith('.tldraw');
    return shouldSync;
  }

  async getLatestFileSHA(path) {
    try {
      const apiUrl = `https://api.github.com/repos/${this.settings.repo}/contents/${path}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${this.settings.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.sha;
      }
      if (response.status === 404) {
        return null;
      }
      const errorData = await response.json();
      throw new Error(`GitHub API error: ${response.status} - ${errorData.message}`);
    } catch (error) {
      if (error.message.includes('GitHub API error')) {
        throw error;
      }
      console.error(`Error fetching SHA for ${path}:`, error);
      return null;
    }
  }

  async createDirectory(path) {
    try {
      // Extract directory path without the filename
      const dirPath = path.split('/').slice(0, -1).join('/');
      if (!dirPath) return; // No directory to create

      // Try to create directory with a .gitkeep file
      const keepFilePath = `${dirPath}/.gitkeep`;
      const apiUrl = `https://api.github.com/repos/${this.settings.repo}/contents/${keepFilePath}`;
      
      // Check if .gitkeep already exists
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${this.settings.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (response.status === 404) {
        // Create .gitkeep file to create the directory
        const createResponse = await fetch(apiUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${this.settings.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `Create ${dirPath} directory`,
            content: btoa(''),
            branch: this.settings.branch
          })
        });

        if (!createResponse.ok) {
          const errorData = await createResponse.json();
          console.error(`Failed to create directory: ${errorData.message}`);
        }
      }
    } catch (error) {
      console.error('Error creating directory:', error);
    }
  }

  async uploadFile(filename, content) {
    if (!this.isConfigured()) return;

    try {
      const path = filename === 'todo.md' ? this.getTodoFilePath() : this.getFilePath(filename);
      const apiUrl = `https://api.github.com/repos/${this.settings.repo}/contents/${path}`;

      // Ensure the directory exists before uploading
      await this.createDirectory(path);

      // Always get the latest SHA before uploading
      const latestSHA = await this.getLatestFileSHA(path);

      const body = {
        message: `Update ${path}`,
        content: btoa(unescape(encodeURIComponent(content))),
        branch: this.settings.branch
      };

      if (latestSHA) {
        body.sha = latestSHA;
      }

      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.settings.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 409) {
          // If we get a 409, try one more time with the latest SHA
          const retryLatestSHA = await this.getLatestFileSHA(path);
          if (retryLatestSHA) {
            body.sha = retryLatestSHA;
            const retryResponse = await fetch(apiUrl, {
              method: 'PUT',
              headers: {
                'Authorization': `token ${this.settings.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(body)
            });
            
            if (!retryResponse.ok) {
              const retryErrorData = await retryResponse.json();
              throw new Error(`GitHub API error: ${retryResponse.status} - ${retryErrorData.message}`);
            }
            
            return retryResponse.json();
          }
        }
        throw new Error(`GitHub API error: ${response.status} - ${errorData.message}`);
      }

      return response.json();
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  async syncTodos(tasks) {
    if (!this.isConfigured()) return;

    let content = `# Todo List\n\nLast updated: ${new Date().toISOString()}\n\n`;

    // Handle inbox tasks
    if (tasks.inbox && tasks.inbox.length > 0) {
      content += '## Inbox\n\n';
      content += tasks.inbox.map(task => {
        const status = task.completed ? '[x]' : '[ ]';
        const dueDate = task.dueDate ? ` (Due: ${task.dueDate})` : '';
        const notes = task.notes ? `\n  Notes: ${task.notes}` : '';
        return `- ${status} ${task.text}${dueDate}${notes}`;
      }).join('\n');
      content += '\n\n';
    }

    // Handle project tasks
    if (tasks.projects) {
      Object.entries(tasks.projects).forEach(([project, projectTasks]) => {
        if (projectTasks.length > 0) {
          content += `## ${project}\n\n`;
          content += projectTasks.map(task => {
            const status = task.completed ? '[x]' : '[ ]';
            const dueDate = task.dueDate ? ` (Due: ${task.dueDate})` : '';
            const notes = task.notes ? `\n  Notes: ${task.notes}` : '';
            return `- ${status} ${task.text}${dueDate}${notes}`;
          }).join('\n');
          content += '\n\n';
        }
      });
    }

    // Handle archived tasks
    if (tasks.archive && tasks.archive.length > 0) {
      content += '## Archive\n\n';
      content += tasks.archive.map(task => {
        const status = task.completed ? '[x]' : '[ ]';
        const dueDate = task.dueDate ? ` (Due: ${task.dueDate})` : '';
        const notes = task.notes ? `\n  Notes: ${task.notes}` : '';
        return `- ${status} ${task.text}${dueDate}${notes}`;
      }).join('\n');
      content += '\n\n';
    }
    
    try {
      await this.uploadFile('todo.md', content);
    } catch (error) {
      console.error('Failed to sync todos:', error);
      throw error;
    }
  }

  // Method to sync all files
  async syncAllFiles() {
    if (!this.isConfigured()) {
      return;
    }
    
    try {
      // Open IndexedDB connection using our utility function
      const db = await openDB();

      // Get todos from the todo store
      const todoTx = db.transaction(TODO_STORE, 'readonly');
      const todoStore = todoTx.objectStore(TODO_STORE);
      const todoRequest = todoStore.get('todoData');
      
      todoRequest.onsuccess = async () => {
        const todoData = todoRequest.result?.data;
        if (todoData) {
          await this.syncTodos(todoData);
        }
      };

      // Get all tabs from the store
      const tx = db.transaction(TABS_STORE, 'readonly');
      const store = tx.objectStore(TABS_STORE);
      const tabs = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      // Sync each file that meets our criteria
      let syncCount = 0;
      for (const tab of tabs) {
        if (this.shouldSyncFile(tab.name)) {
          try {
            await this.uploadFile(tab.name, tab.content);
            syncCount++;
          } catch (error) {
            console.error(`Failed to sync file ${tab.name}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error syncing files:', error);
      throw error; // Re-throw to be caught by the toolbar handler
    }
  }

  async getCurrentMonthFiles() {
    if (!this.isConfigured()) return [];

    try {
      const date = new Date();
      const currentYear = date.getFullYear();
      const currentMonth = date.getMonth() + 1;
      
      // Get last month's year and month
      const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;

      // Format the paths
      const currentPath = `${currentYear}/${String(currentMonth).padStart(2, '0')}`;
      const lastPath = `${lastMonthYear}/${String(lastMonth).padStart(2, '0')}`;

      // Fetch files from both months
      const [currentFiles, lastMonthFiles] = await Promise.all([
        this.fetchFilesFromPath(currentPath),
        this.fetchFilesFromPath(lastPath)
      ]);

      // Combine and return all files
      return [...currentFiles, ...lastMonthFiles];
    } catch (error) {
      console.error('Error fetching files:', error);
      return [];
    }
  }

  async fetchFilesFromPath(path) {
    try {
      const apiUrl = `https://api.github.com/repos/${this.settings.repo}/contents/${path}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${this.settings.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return []; // Directory doesn't exist yet
        }
        throw new Error(`Failed to fetch files: ${response.statusText}`);
      }

      const files = await response.json();
      return files
        .filter(file => file.type === 'file')
        .map(file => ({
          name: file.name,
          path: file.path,
          sha: file.sha,
          size: file.size,
          url: file.download_url,
          month: path.split('/')[1] // Add month info for display
        }));
    } catch (error) {
      console.error(`Error fetching files from ${path}:`, error);
      return [];
    }
  }

  async getFileContent(path) {
    if (!this.isConfigured()) return null;

    try {
      const apiUrl = `https://api.github.com/repos/${this.settings.repo}/contents/${path}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${this.settings.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch file content: ${response.statusText}`);
      }

      const data = await response.json();
      const content = decodeURIComponent(escape(atob(data.content)));
      return content;
    } catch (error) {
      console.error('Error fetching file content:', error);
      return null;
    }
  }
}

export default new GitHubService();
