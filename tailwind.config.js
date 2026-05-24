/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: "class",
    content: [
        "./public/index.html",
        "./src/**/*.{html,js,jsx,ts,tsx}",
    ],

    theme: {
        extend: {
            colors: {
                arl: {
                    primary: "#1A5F7A",
                    secondary: "#4FC3F7",
                    cta: "#D32F2F",
                    light: "#F5F7FA",
                    dark: "#141414",
                },
            },

            fontFamily: {
                display: ['"Playfair Display"', "serif"],
                sans: ['"Plus Jakarta Sans"', "sans-serif"],
            },

            boxShadow: {
                soft: "0 10px 30px rgba(0,0,0,0.08)",
                card: "0 15px 40px rgba(0,0,0,0.10)",
                premium: "0 20px 60px rgba(0,0,0,0.12)",
            },

            borderRadius: {
                xl: "1rem",
                "2xl": "1.25rem",
                "3xl": "1.75rem",
            },

            spacing: {
                18: "4.5rem",
                22: "5.5rem",
                26: "6.5rem",
            },

            transitionTimingFunction: {
                smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
            },

            backgroundImage: {
                "hero-overlay":
                    "linear-gradient(to right, rgba(0,0,0,0.72) 35%, rgba(0,0,0,0) 65%)",
            },

            backdropBlur: {
                xs: "2px",
            },
        },
    },

    plugins: [],
};