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

// PUT: Update blog by ID
exports.updateBlog = async (req, res) => {
    try {
        const blogId = req.params.id;
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

        // Fetch blog first
        const existingBlog = await Blog.findByPk(blogId);
        if (!existingBlog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }

        let imageUrl = existingBlog.image;

        // If new image uploaded, upload to S3
        if (req.files && req.files.imageFile) {
            const { imageFile } = req.files;
            const folder = `blogs/${title.trim().replace(/\s+/g, "_")}_${Date.now()}`;
            imageUrl = await Utility.uploadToS3(folder, imageFile);
        }

        // Update the blog
        await existingBlog.update({
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

        res.status(200).json({ success: true, blog: existingBlog });
    } catch (error) {
        console.error("Error updating blog:", error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};


exports.deleteBlog = async (req, res) => {
    try {
        const blogId = req.params.id;
        const blog = await Blog.findByPk(blogId);
        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }

        await blog.destroy();
        res.json({ success: true, message: "Blog deleted successfully" });
    } catch (error) {
        console.error("Delete blog error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
