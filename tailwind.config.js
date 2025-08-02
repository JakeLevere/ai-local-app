module.exports = {
  content: ["./index.html", "./**/*.js"],
  theme: {
    extend: {
      colors: {
        'sidebar-bg': '#1f1f23',
        'sidebar-item-hover': 'rgba(135, 206, 250, 0.1)',
        'sidebar-item-selected': 'rgba(135, 206, 250, 0.2)',
        'baby-blue': '#87CEFA',
        'baby-blue-darker': '#6495ED',
        'bg-very-dark': '#0e0e10',
        'bg-dark-grey': '#18181b',
        'text-off-white': '#efeff1',
        'text-grey': '#adadb8',
        'text-dark-grey': '#888',
        'border': '#444',
        'separator': '#3a3a3d',
        'input-bg': '#3a3a3d',
        'button-text-dark': '#111',
        'user-green': '#7FFFD4',
        'light-cyan': '#e0ffff',
        'display-highlight': 'rgba(255,165,0,0.6)'
      },
      spacing: {
        'scroll': '10px',
        'primary-icon': '38px',
        'primary-item-x': '10px',
        'primary-item-y': '8px'
      },
      fontSize: {
        'primary': '0.95em'
      },
      borderRadius: {
        'sm': '4px',
        'md': '5px',
        'lg': '10px'
      }
    }
  },
  plugins: []
};
