// services/finboxService.js

const fetchCibilScore = async ({ name, pan, phone, dob }) => {
    console.log("Fetching mock CIBIL score for:", { name, pan, phone, dob });

    // Return a random score for testing
    return Math.floor(Math.random() * (800 - 600 + 1)) + 600;
};

module.exports = { fetchCibilScore };
