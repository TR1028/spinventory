/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18212f",
        paper: "#f6f7f2",
        court: "#107a6d",
        spin: "#d8523f",
        rubber: "#243b53",
        limeglass: "#e7f4d8",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(24, 33, 47, 0.08)",
      },
    },
  },
  plugins: [],
};
