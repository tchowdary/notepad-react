import { DB_NAME, DB_VERSION, TABS_STORE, TODO_STORE, openDB } from '../utils/db';
import { base64Utils } from '../utils/converters';

class GitHubService {
  constructor() {
    this.syncInterval = 2 * 60 * 60 * 1000; // 2 hours
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
    if (filename.startsWith('Note') || filename.startsWith('Code') || filename.endsWith('.tldraw')) {
      return false;
    }
    
    // Special case for todos file
    if (filename === 'Todo') {
      return true;
    }
    
    // Include .md and .tldraw files
    //const shouldSync = filename.endsWith('.md') || filename.endsWith('.tldraw');
    return true;
  }

  async getLatestFileSHA(path) {
    if (!this.isConfigured()) return null;

    try {
      const response = await fetch(
        `https://api.github.com/repos/${this.settings.repo}/contents/${path}?ref=${this.settings.branch}`,
        {
          headers: {
            'Authorization': `token ${this.settings.token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const errorData = await response.json();
        console.error('Error getting SHA:', errorData);
        throw new Error(`Failed to get file SHA: ${errorData.message}`);
      }

      const data = await response.json();
      return data.sha;
    } catch (error) {
      if (error.message.includes('404')) {
        return null;
      }
      console.error('Error in getLatestFileSHA:', error);
      throw error;
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

  async uploadFile(filename, content, tab = null) {
    if (!this.isConfigured()) return;

    try {
      const path = this.getFilePath(filename);
      const sha = await this.getLatestFileSHA(path);
      
      // Create base64 content
      const contentBase64 = btoa(unescape(encodeURIComponent(content)));
      
      const requestBody = {
        message: `Update ${filename}`,
        content: contentBase64,
        branch: this.settings.branch
      };
      
      if (sha) {
        requestBody.sha = sha;
      }

      const response = await fetch(
        `https://api.github.com/repos/${this.settings.repo}/contents/${path}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `token ${this.settings.token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Upload error response:', errorData);
        throw new Error(`Failed to upload file: ${errorData.message}`);
      }

      const responseData = await response.json();

      // If a tab was provided, update its lastSynced timestamp
      if (tab) {
        const db = await openDB();
        const tx = db.transaction(TABS_STORE, 'readwrite');
        const store = tx.objectStore(TABS_STORE);
        
        await store.put({
          ...tab,
          lastSynced: new Date().toISOString()
        });
      }
      
      return responseData;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  async findExistingFilePath(path) {
    const pathParts = path.split('/');
    if (pathParts.length < 3) return path;

    const currentYear = parseInt(pathParts[0]);
    const currentMonth = parseInt(pathParts[1]);
    const filename = pathParts[2];


    // Check current month first
    const currentSHA = await this.getLatestFileSHA(path);
    if (currentSHA) {
      return path;
    }

    // If not in current month, check previous month
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevPath = `${prevYear}/${String(prevMonth).padStart(2, '0')}/${filename}`;
    
    const prevSHA = await this.getLatestFileSHA(prevPath);
    
    if (prevSHA) {
      return prevPath;
    }

    return path;
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

  getChatFilePath(sessionId, title) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const sanitizedTitle = title && typeof title === 'string' ? `${title.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()}-` : '';
    return sanitizedTitle === ' ' ? `chats/${year}/${month}/${sessionId}.md` : `chats/${year}/${month}/${sanitizedTitle}${sessionId}.md`;
  }

  async syncChats() {
    if (!this.isConfigured()) return;

    try {
      // Open chatDB with the correct version
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('chatDB', 3);
        
        request.onerror = () => reject(request.error);
        
        request.onupgradeneeded = (event) => {
          console.log('Upgrading chat database in GitHub service');
          const db = event.target.result;
          if (!db.objectStoreNames.contains('chatSessions')) {
            const store = db.createObjectStore('chatSessions', { keyPath: 'id' });
            store.createIndex('lastUpdated', 'lastUpdated');
            store.createIndex('lastSynced', 'lastSynced');
          } else if (event.oldVersion === 1) {
            const store = event.currentTarget.transaction.objectStore('chatSessions');
            if (!store.indexNames.contains('lastSynced')) {
              store.createIndex('lastSynced', 'lastSynced');
            }
          }
        };
        
        request.onsuccess = () => {
          console.log('Successfully opened chat database for sync, version:', request.result.version);
          resolve(request.result);
        };
      });

      const tx = db.transaction('chatSessions', 'readwrite');
      const store = tx.objectStore('chatSessions');
      const sessions = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      let syncCount = 0;
      for (const session of sessions) {
        if (!session.messages || session.messages.length === 0) continue;

        try {
          const needsSync = !session.lastSynced || 
                          (session.lastUpdated && this.compareDates(session.lastUpdated, session.lastSynced));

          if (needsSync) {
            // Format chat content in markdown
            let content = `# ${session.title}\n\nLast updated: ${session.lastUpdated}\n\n`;
            content += session.messages.map(msg => {
              let messageContent = '';
              
              // Handle different message content types
              if (typeof msg.content === 'string') {
                messageContent = msg.content;
              } else if (Array.isArray(msg.content)) {
                messageContent = msg.content.map(item => {
                  if (typeof item === 'string') return item;
                  if (item.text) return item.text;
                  if (item.content) return item.content;
                  return JSON.stringify(item);
                }).join('\n');
              } else if (msg.content?.type === 'text') {
                messageContent = msg.content.text;
              } else if (typeof msg.content?.content === 'string') {
                messageContent = msg.content.content;
              } else if (msg.content?.content?.text) {
                messageContent = msg.content.content.text;
              } else if (msg.content) {
                messageContent = JSON.stringify(msg.content, null, 2);
              } else {
                messageContent = '[Empty message]';
              }

              // Special handling for code blocks
              const parts = messageContent.split(/(```[^`]*```)/g);
              messageContent = parts.map((part, index) => {
                if (part.startsWith('```') && part.endsWith('```')) {
                  return part;
                } else {
                  return part
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0)
                    .join('\n\n');
                }
              }).join('\n\n');

              return `### ${msg.role === 'user' ? 'User' : 'Assistant'}\n\n${messageContent}\n\n---\n`;
            }).join('\n');

            const path = this.getChatFilePath(session.id, session.title);
            await this.uploadFile(path, content);

            // Update lastSynced timestamp
            const now = new Date().toISOString();
            const updatedSession = {
              ...session,
              lastSynced: now
            };
            
            // Use a separate transaction to update the lastSynced timestamp
            const updateTx = db.transaction('chatSessions', 'readwrite');
            const updateStore = updateTx.objectStore('chatSessions');
            
            await new Promise((resolve, reject) => {
              const updateRequest = updateStore.put(updatedSession);
              
              updateRequest.onsuccess = () => {
                console.log(`Updated lastSynced for session ${session.id} to:`, now);
                resolve();
              };
              
              updateRequest.onerror = (error) => {
                console.error(`Failed to update lastSynced for session ${session.id}:`, error);
                reject(updateRequest.error);
              };
              
              updateTx.oncomplete = () => {
                console.log(`Transaction completed for session ${session.id}`);
              };
              
              updateTx.onerror = (error) => {
                console.error(`Transaction failed for session ${session.id}:`, error);
              };
            });

            syncCount++;
            //console.log(`Successfully synced chat session ${session.id}`);
          } else {
            //console.log(`Skipping chat session ${session.id} - no changes since last sync`);
          }
        } catch (sessionError) {
          console.error(`Error processing chat session ${session.id}:`, sessionError);
          continue;
        }
      }

      console.log(`Synced ${syncCount} chat sessions to GitHub`);
    } catch (error) {
      console.error('Error syncing chats:', error);
      throw error;
    }
  }

  // Helper function to safely parse dates and compare them
  compareDates(date1, date2) {
    try {
      const d1 = new Date(date1).getTime();
      const d2 = new Date(date2).getTime();
      return d1 > d2;
    } catch (error) {
      console.error('Error comparing dates:', error, { date1, date2 });
      return true; // If there's an error, sync to be safe
    }
  }

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

      // Get current date for day comparison
      const today = new Date();
      const todayDateString = today.toISOString().split('T')[0]; // YYYY-MM-DD format

      // Sync each file that meets our criteria
      let syncCount = 0;
      for (const tab of tabs) {
        if (this.shouldSyncFile(tab.name)) {
          // Check if the file was modified today or has never been synced or force sync is enabled
          let modifiedToday = false;
          if (tab.lastModified) {
            const lastModifiedDate = new Date(tab.lastModified);
            const lastModifiedDateString = lastModifiedDate.toISOString().split('T')[0];
            modifiedToday = lastModifiedDateString === todayDateString;
          }
          
          // A file needs sync if:
          // 1. It has never been synced (no lastSynced)
          // 2. It was modified today and has changes since last sync
          // 3. Force sync is enabled
          const needsSync = !tab.lastSynced || 
                          (modifiedToday && 
                           this.compareDates(tab.lastModified, tab.lastSynced)) ||
                          tab.forceSync;
          
          console.log(`Tab ${tab.name} sync status:`, {
            lastModified: tab.lastModified,
            lastSynced: tab.lastSynced,
            modifiedToday,
            needsSync
          });

          if (needsSync) {
            try {
              await this.uploadFile(tab.name, tab.content, tab);
              
              // Clear the forceSync flag after successful sync
              if (tab.forceSync) {
                const updateTx = db.transaction(TABS_STORE, 'readwrite');
                const updateStore = updateTx.objectStore(TABS_STORE);
                tab.forceSync = false;
                await new Promise((resolve, reject) => {
                  const request = updateStore.put(tab);
                  request.onerror = () => reject(request.error);
                  request.onsuccess = () => resolve();
                });
              }
              
              syncCount++;
              console.log(`Synced ${tab.name} to GitHub`);
            } catch (error) {
              console.error(`Failed to sync file ${tab.name}:`, error);
            }
          } else {
            console.log(`Skipping ${tab.name} - no changes since last sync or not modified today`);
          }
        }
      }

      // Sync chats
      await this.syncChats();
      
      console.log(`Synced ${syncCount} files to GitHub`);
    } catch (error) {
      console.error('Error in syncAllFiles:', error);
    }
  }

  async forceSyncTab(tabId) {
    if (!this.isConfigured()) {
      return { success: false, message: 'GitHub is not configured' };
    }
    
    try {
      const db = await openDB();
      const tx = db.transaction(TABS_STORE, 'readwrite');
      const store = tx.objectStore(TABS_STORE);
      
      // Get the tab
      const tab = await new Promise((resolve, reject) => {
        const request = store.get(tabId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      
      if (!tab) {
        return { success: false, message: 'Tab not found' };
      }
      
      // Mark the tab for forced sync
      tab.forceSync = true;
      
      // Save the updated tab
      await new Promise((resolve, reject) => {
        const request = store.put(tab);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
      
      // Trigger sync for this tab
      try {
        await this.uploadFile(tab.name, tab.content, tab);
        return { success: true, message: `Successfully synced ${tab.name} to GitHub` };
      } catch (error) {
        console.error(`Failed to force sync ${tab.name}:`, error);
        return { success: false, message: `Failed to sync: ${error.message}` };
      }
    } catch (error) {
      console.error('Error in forceSyncTab:', error);
      return { success: false, message: `Error: ${error.message}` };
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
      const content = base64Utils.decodeFromBase64(data.content);
      return content;
    } catch (error) {
      console.error('Error fetching file content:', error);
      return null;
    }
  }
}

export default new GitHubService();
