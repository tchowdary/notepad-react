import React, { useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Checkbox,
  TextField,
  Button,
  Divider,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Link,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Inbox as InboxIcon,
  Archive as ArchiveIcon,
  Folder as FolderIcon,
  MoreVert as MoreVertIcon,
  Today as TodayIcon,
  Event as EventIcon,
} from '@mui/icons-material';

// Function to extract URLs from text
const extractUrls = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
};

// Function to convert text with URLs to JSX with links
const textWithLinks = (text) => {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, index) => {
    if (part.match(/(https?:\/\/[^\s]+)/g)) {
      return (
        <Link
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          sx={{ color: 'inherit' }}
        >
          {part}
        </Link>
      );
    }
    return part;
  });
};

// Function to format date to dd-mm-yy format
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  return `${day}-${month}-${year}`;
};

// Function to check if a date is today
const isToday = (dateString) => {
  const today = new Date();
  const date = new Date(dateString);
  return date.toDateString() === today.toDateString();
};

// Function to get today's date in YYYY-MM-DD format
const getTodayString = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

const TodoManager = ({ tasks, onTasksChange }) => {
  const [newTask, setNewTask] = useState('');
  const [selectedProject, setSelectedProject] = useState('inbox');
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const dateInputRef = React.useRef(null);

  const handleAddTask = () => {
    if (!newTask.trim()) return;
    
    const newTaskObj = {
      id: Date.now(),
      text: newTask,
      completed: false,
      list: selectedProject,
      urls: extractUrls(newTask),
      dueDate: selectedDate || null
    };

    if (selectedProject === 'inbox' || selectedProject === 'archive') {
      onTasksChange({
        ...tasks,
        [selectedProject]: [...tasks[selectedProject], newTaskObj]
      });
    } else {
      onTasksChange({
        ...tasks,
        projects: {
          ...tasks.projects,
          [selectedProject]: [...(tasks.projects[selectedProject] || []), newTaskObj]
        }
      });
    }
    setNewTask('');
    setSelectedDate('');
  };

  const handleToggleTask = (taskId) => {
    let taskToArchive = null;
    let updatedTasks = { ...tasks };

    // Find and update the task
    if (selectedProject === 'inbox') {
      const taskIndex = updatedTasks.inbox.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        taskToArchive = { ...updatedTasks.inbox[taskIndex], completed: true };
        updatedTasks.inbox = updatedTasks.inbox.filter(t => t.id !== taskId);
      }
    } else if (selectedProject === 'archive') {
      const taskIndex = updatedTasks.archive.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        const task = updatedTasks.archive[taskIndex];
        updatedTasks.archive[taskIndex] = { ...task, completed: !task.completed };
      }
    } else {
      const projectTasks = updatedTasks.projects[selectedProject];
      const taskIndex = projectTasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        taskToArchive = { ...projectTasks[taskIndex], completed: true };
        updatedTasks.projects[selectedProject] = projectTasks.filter(t => t.id !== taskId);
      }
    }

    // Move completed task to archive
    if (taskToArchive && selectedProject !== 'archive') {
      updatedTasks.archive = [...updatedTasks.archive, taskToArchive];
    }

    onTasksChange(updatedTasks);
  };

  const getTodayTasks = () => {
    const allTasks = [
      ...tasks.inbox,
      ...Object.values(tasks.projects || {}).flat()
    ];
    
    return allTasks.filter(task => 
      task.dueDate && isToday(task.dueDate) && !task.completed
    );
  };

  const handleTaskMenu = (event, task) => {
    setSelectedTask(task);
    setAnchorEl(event.currentTarget);
  };

  const handleUpdateDueDate = (taskId, newDate) => {
    let updatedTasks = { ...tasks };
    
    // Find and update the task
    if (selectedProject === 'inbox') {
      const taskIndex = updatedTasks.inbox.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        updatedTasks.inbox[taskIndex] = {
          ...updatedTasks.inbox[taskIndex],
          dueDate: newDate || null
        };
      }
    } else if (selectedProject === 'archive') {
      const taskIndex = updatedTasks.archive.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        updatedTasks.archive[taskIndex] = {
          ...updatedTasks.archive[taskIndex],
          dueDate: newDate || null
        };
      }
    } else if (selectedProject !== 'today') {
      const projectTasks = updatedTasks.projects[selectedProject];
      const taskIndex = projectTasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        updatedTasks.projects[selectedProject][taskIndex] = {
          ...projectTasks[taskIndex],
          dueDate: newDate || null
        };
      }
    }

    onTasksChange(updatedTasks);
  };

  const handleMoveTask = (targetList) => {
    if (!selectedTask) return;

    let updatedTasks = { ...tasks };
    
    // Remove from current list
    if (selectedProject === 'inbox' || selectedProject === 'archive') {
      updatedTasks[selectedProject] = updatedTasks[selectedProject].filter(
        task => task.id !== selectedTask.id
      );
    } else if (selectedProject !== 'today') {
      updatedTasks.projects[selectedProject] = updatedTasks.projects[selectedProject].filter(
        task => task.id !== selectedTask.id
      );
    }

    // Update task with today's date if moving to Today list
    const updatedTask = {
      ...selectedTask,
      list: targetList,
      dueDate: targetList === 'today' ? getTodayString() : selectedTask.dueDate
    };

    // Add to target list
    if (targetList === 'inbox' || targetList === 'archive') {
      updatedTasks[targetList] = [...updatedTasks[targetList], updatedTask];
    } else if (targetList !== 'today') {
      updatedTasks.projects[targetList] = [
        ...(updatedTasks.projects[targetList] || []),
        updatedTask
      ];
    }

    onTasksChange(updatedTasks);
    setAnchorEl(null);
    setSelectedTask(null);
  };

  const handleAddProject = () => {
    if (!newProjectName.trim()) return;
    
    onTasksChange({
      ...tasks,
      projects: {
        ...tasks.projects,
        [newProjectName]: []
      }
    });
    
    setNewProjectName('');
    setNewProjectDialogOpen(false);
  };

  const getCurrentTasks = () => {
    if (selectedProject === 'today') {
      return getTodayTasks();
    }
    if (selectedProject === 'inbox' || selectedProject === 'archive') {
      return tasks[selectedProject];
    }
    return tasks.projects[selectedProject] || [];
  };

  const handleDateClick = (event, taskId) => {
    event.stopPropagation();
    setEditingTaskId(taskId);
    
    // Get current task's date
    const currentTask = tasks.inbox.find(t => t.id === taskId) || 
                       tasks.archive.find(t => t.id === taskId) ||
                       Object.values(tasks.projects || {}).flat().find(t => t.id === taskId);
    
    if (dateInputRef.current) {
      dateInputRef.current.value = currentTask?.dueDate || '';
      dateInputRef.current.showPicker();
    }
  };

  const handleDateChange = (event) => {
    if (editingTaskId) {
      handleUpdateDueDate(editingTaskId, event.target.value);
      setEditingTaskId(null);
    }
  };

  const handleDeleteTask = (taskId) => {
    let updatedTasks = { ...tasks };
    
    if (selectedProject === 'inbox') {
      updatedTasks.inbox = updatedTasks.inbox.filter(t => t.id !== taskId);
    } else if (selectedProject === 'archive') {
      updatedTasks.archive = updatedTasks.archive.filter(t => t.id !== taskId);
    } else if (selectedProject !== 'today') {
      updatedTasks.projects[selectedProject] = updatedTasks.projects[selectedProject].filter(t => t.id !== taskId);
    }

    onTasksChange(updatedTasks);
    setAnchorEl(null);
    setSelectedTask(null);
  };

  const handleDeleteProject = (projectName) => {
    let updatedTasks = { ...tasks };
    delete updatedTasks.projects[projectName];
    onTasksChange(updatedTasks);
    setSelectedProject('inbox');
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', fontFamily: 'JetBrains Mono, monospace' }}>
      {/* Hidden date input */}
      <input
        ref={dateInputRef}
        type="date"
        style={{ position: 'fixed', top: '-100px' }}
        onChange={handleDateChange}
      />

      {/* Sidebar */}
      <Box sx={{ width: 240, borderRight: 1, borderColor: 'divider', p: 2, display: 'flex', flexDirection: 'column' }}>
        <List>
          <ListItem button onClick={() => setSelectedProject('inbox')}>
            <ListItemIcon>
              <InboxIcon />
            </ListItemIcon>
            <ListItemText 
              primary="Inbox" 
              sx={{ '& .MuiTypography-root': { fontFamily: 'JetBrains Mono, monospace' } }}
            />
          </ListItem>

          <ListItem button onClick={() => setSelectedProject('today')}>
            <ListItemIcon>
              <TodayIcon />
            </ListItemIcon>
            <ListItemText 
              primary="Today" 
              secondary={getTodayTasks().length > 0 ? `${getTodayTasks().length} tasks` : null}
              sx={{ '& .MuiTypography-root': { fontFamily: 'JetBrains Mono, monospace' } }}
            />
          </ListItem>
          
          <ListItem button onClick={() => setSelectedProject('archive')}>
            <ListItemIcon>
              <ArchiveIcon />
            </ListItemIcon>
            <ListItemText 
              primary="Archive"
              sx={{ '& .MuiTypography-root': { fontFamily: 'JetBrains Mono, monospace' } }}
            />
          </ListItem>

          <Divider sx={{ my: 1 }} />
          
          <ListItem>
            <ListItemText 
              primary="Projects" 
              sx={{ '& .MuiTypography-root': { fontFamily: 'JetBrains Mono, monospace' } }}
            />
            <IconButton size="small" onClick={() => setNewProjectDialogOpen(true)}>
              <AddIcon />
            </IconButton>
          </ListItem>

          {Object.keys(tasks.projects || {}).map(project => (
            <ListItem 
              button 
              key={project}
              onClick={() => setSelectedProject(project)}
              secondaryAction={
                <IconButton 
                  edge="end" 
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteProject(project);
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              }
            >
              <ListItemIcon>
                <FolderIcon />
              </ListItemIcon>
              <ListItemText 
                primary={project}
                sx={{ '& .MuiTypography-root': { fontFamily: 'JetBrains Mono, monospace' } }}
              />
            </ListItem>
          ))}
        </List>
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, p: 2 }}>
        <Typography 
          variant="h6" 
          sx={{ mb: 2, fontFamily: 'JetBrains Mono, monospace' }}
        >
          {selectedProject.charAt(0).toUpperCase() + selectedProject.slice(1)}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            fullWidth
            size="small"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Add new task"
            onKeyPress={(e) => e.key === 'Enter' && handleAddTask()}
            sx={{ 
              '& .MuiInputBase-root': { 
                fontFamily: 'JetBrains Mono, monospace' 
              } 
            }}
          />
          <IconButton onClick={handleAddTask}>
            <AddIcon />
          </IconButton>
        </Box>

        <List>
          {getCurrentTasks().map(task => (
            <ListItem
              key={task.id}
              alignItems="flex-start"
              secondaryAction={
                <IconButton 
                  edge="end" 
                  onClick={(e) => handleTaskMenu(e, task)}
                >
                  <MoreVertIcon />
                </IconButton>
              }
            >
              <ListItemIcon>
                <Checkbox
                  edge="start"
                  checked={task.completed}
                  onChange={() => handleToggleTask(task.id)}
                />
              </ListItemIcon>
              <ListItemText 
                primary={textWithLinks(task.text)}
                secondary={
                  <Box 
                    component="span" 
                    sx={{ 
                      display: 'flex',
                      alignItems: 'center',
                      mt: 0.5,
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: 'action.hover',
                        borderRadius: 1,
                      },
                      p: 0.5,
                    }}
                    onClick={(e) => handleDateClick(e, task.id)}
                  >
                    {task.dueDate ? (
                      <Typography
                        variant="caption"
                        sx={{
                          color: isToday(task.dueDate) ? 'error.main' : 'text.secondary',
                          fontFamily: 'JetBrains Mono, monospace',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5
                        }}
                      >
                        <EventIcon fontSize="small" />
                        {formatDate(task.dueDate)}
                      </Typography>
                    ) : (
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontFamily: 'JetBrains Mono, monospace',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5
                        }}
                      >
                        <EventIcon fontSize="small" />
                        Add due date
                      </Typography>
                    )}
                  </Box>
                }
                sx={{ 
                  '& .MuiTypography-root': { 
                    fontFamily: 'JetBrains Mono, monospace',
                    textDecoration: task.completed ? 'line-through' : 'none'
                  } 
                }}
              />
            </ListItem>
          ))}
        </List>
      </Box>

      {/* Task Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => {
          setAnchorEl(null);
          setSelectedTask(null);
        }}
      >
        <MenuItem onClick={(e) => {
          handleDateClick(e, selectedTask?.id);
          setAnchorEl(null);
        }}>
          Set due date
        </MenuItem>
        <MenuItem onClick={() => handleMoveTask('today')}>
          Move to Today
        </MenuItem>
        <MenuItem onClick={() => handleMoveTask('inbox')}>
          Move to Inbox
        </MenuItem>
        {Object.keys(tasks.projects || {}).map(project => (
          <MenuItem 
            key={project}
            onClick={() => handleMoveTask(project)}
          >
            Move to {project}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem 
          onClick={() => handleDeleteTask(selectedTask?.id)}
          sx={{ color: 'error.main' }}
        >
          Delete task
        </MenuItem>
      </Menu>

      {/* New Project Dialog */}
      <Dialog 
        open={newProjectDialogOpen} 
        onClose={() => setNewProjectDialogOpen(false)}
      >
        <DialogTitle sx={{ fontFamily: 'JetBrains Mono, monospace' }}>
          New Project
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Project Name"
            fullWidth
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            sx={{ 
              '& .MuiInputBase-root': { 
                fontFamily: 'JetBrains Mono, monospace' 
              } 
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewProjectDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddProject}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TodoManager;
