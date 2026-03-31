/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ari: {
          bg: "#0f0f11",
          card: "#1a1a1f",
          accent: "#7c6dff"
        }
      }
    }
  },
  plugins: []
};

