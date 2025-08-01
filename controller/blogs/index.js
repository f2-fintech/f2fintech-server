const Blog = require("../../model/blogs/index");
const Utility = require("../../utility");

exports.createBlog = async (req, res) => {
    try {
        const {
            title,
            excerpt,
            category,
            author,
            route,
            readTime,
            featured,
            content,
            href,
            date,
        } = req.body;

        console.log("req.files>>", req.files, req.body);
        // Ensure file exists
        if (!req.files) {
            return res
                .status(400)
                .json({ success: false, message: "Image file is required" });
        }
        const { imageFile } = req.files;
        const folder = `blogs/${title.trim().replace(/\s+/g, "_")}_${Date.now()}`;

        // Upload to S3 and get URL
        const imageUrl = await Utility.uploadToS3(folder, imageFile);


        console.log("imageUrl>>>", imageUrl);

        const newBlog = await Blog.create({
            title,
            excerpt,
            category,
            author,
            route,
            readTime,
            featured,
            image: imageUrl,
            content,
            href,
            date,
        });

        res.status(201).json({ success: true, blog: newBlog });
    } catch (error) {
        console.error("Error creating blog:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// GET: Fetch all blogs
exports.getAllBlogs = async (req, res) => {
    try {
        const blogs = await Blog.findAll({
            order: [["id", "DESC"]],
        });

        res.status(200).json({ success: true, blogs });
    } catch (error) {
        console.error("Error fetching blogs:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};