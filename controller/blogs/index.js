const Blog = require( "../../model/blogs/index" );
const Utility = require( "../../utility" );

/**
 * Extract base64 images from HTML content and upload to S3
 * Returns modified HTML with S3 URLs instead of base64
 */
async function processContentImages( content, blogTitle ) {
    if ( !content ) return content;

    // Regex to find base64 images in img tags
    const base64ImageRegex = /<img[^>]+src="data:image\/([^;]+);base64,([^"]+)"[^>]*>/g;

    let processedContent = content;
    let match;
    let imageIndex = 0;

    // Find all base64 images
    const matches = [];
    while ( ( match = base64ImageRegex.exec( content ) ) !== null ) {
        matches.push( {
            fullMatch: match[ 0 ],
            imageType: match[ 1 ], // png, jpeg, etc.
            base64Data: match[ 2 ]
        } );
    }

    // Process each base64 image
    for ( const imageMatch of matches ) {
        try {
            // Convert base64 to buffer
            const imageBuffer = Buffer.from( imageMatch.base64Data, 'base64' );

            // Create a file-like object for S3 upload
            const imageFile = {
                name: `editor-image-${ imageIndex }.${ imageMatch.imageType }`,
                data: imageBuffer,
                mimetype: `image/${ imageMatch.imageType }`,
                size: imageBuffer.length
            };

            // Upload to S3
            const folder = `blogs/${ blogTitle.trim().replace( /\s+/g, "_" ) }_${ Date.now() }/content`;
            const imageUrl = await Utility.uploadToS3( folder, imageFile );

            // Replace base64 with S3 URL in content
            const base64Src = `data:image/${ imageMatch.imageType };base64,${ imageMatch.base64Data }`;
            processedContent = processedContent.replace( base64Src, imageUrl );

            imageIndex++;
        } catch ( error ) {
            console.error( `Error processing image ${ imageIndex }:`, error );
            // Continue with other images even if one fails
        }
    }

    return processedContent;
}

exports.createBlog = async ( req, res ) => {
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

        console.log( "Creating blog:", title );
        console.log( "Content length before processing:", content?.length );

        // Process content to extract and upload base64 images
        const processedContent = await processContentImages( content, title );
        console.log( "Content length after processing:", processedContent?.length );

        let imageUrl = null;

        // Handle featured image upload
        if ( req.files && req.files.imageFile ) {
            const { imageFile } = req.files;
            const folder = `blogs/${ title.trim().replace( /\s+/g, "_" ) }_${ Date.now() }/featured`;
            imageUrl = await Utility.uploadToS3( folder, imageFile );
        }

        const newBlog = await Blog.create( {
            title,
            excerpt,
            category,
            author,
            route,
            readTime,
            featured,
            image: imageUrl,
            content: processedContent, // Use processed content with S3 URLs
            href,
            date,
        } );

        res.status( 201 ).json( { success: true, blog: newBlog } );
    } catch ( error ) {
        console.error( "Error creating blog:", error );
        res.status( 500 ).json( {
            success: false,
            error: "Internal server error",
            message: error.message
        } );
    }
};

exports.getAllBlogs = async ( req, res ) => {
    try {
        const blogs = await Blog.findAll( {
            order: [ [ "id", "DESC" ] ],
        } );

        res.status( 200 ).json( { success: true, blogs } );
    } catch ( error ) {
        console.error( "Error fetching blogs:", error );
        res.status( 500 ).json( { success: false, error: "Internal server error" } );
    }
};

exports.updateBlog = async ( req, res ) => {
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

        // Fetch existing blog
        const existingBlog = await Blog.findByPk( blogId );
        if ( !existingBlog ) {
            return res.status( 404 ).json( { success: false, message: "Blog not found" } );
        }

        console.log( "Updating blog:", title );
        console.log( "Content length before processing:", content?.length );

        // Process content to extract and upload base64 images
        const processedContent = await processContentImages( content, title );
        console.log( "Content length after processing:", processedContent?.length );

        let imageUrl = existingBlog.image;

        // Handle featured image upload if provided
        if ( req.files && req.files.imageFile ) {
            const { imageFile } = req.files;
            const folder = `blogs/${ title.trim().replace( /\s+/g, "_" ) }_${ Date.now() }/featured`;
            imageUrl = await Utility.uploadToS3( folder, imageFile );
        }

        // Update the blog
        await existingBlog.update( {
            title,
            excerpt,
            category,
            author,
            route,
            readTime,
            featured,
            image: imageUrl,
            content: processedContent, // Use processed content with S3 URLs
            href,
            date,
        } );

        res.status( 200 ).json( { success: true, blog: existingBlog } );
    } catch ( error ) {
        console.error( "Error updating blog:", error );
        res.status( 500 ).json( {
            success: false,
            error: "Internal server error",
            message: error.message
        } );
    }
};

exports.getBlogById = async ( req, res ) => {
    try {
        const blogId = req.params.id;
        const blog = await Blog.findByPk( blogId );

        if ( !blog ) {
            return res.status( 404 ).json( { success: false, message: "Blog not found" } );
        }

        res.status( 200 ).json( { success: true, blog } );
    } catch ( error ) {
        console.error( "Error fetching blog by ID:", error );
        res.status( 500 ).json( { success: false, error: "Internal server error" } );
    }
};

exports.deleteBlog = async ( req, res ) => {
    try {
        const blogId = req.params.id;
        const blog = await Blog.findByPk( blogId );

        if ( !blog ) {
            return res.status( 404 ).json( { success: false, message: "Blog not found" } );
        }

        await blog.destroy();
        res.json( { success: true, message: "Blog deleted successfully" } );
    } catch ( error ) {
        console.error( "Delete blog error:", error );
        res.status( 500 ).json( { success: false, message: "Internal server error" } );
    }
};