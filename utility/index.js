/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const config = require("../config");

const salt = config.SALT;
const secret = config.SECRET;
const bucketName = config.BUCKET;
const region = config.REGION;
const accessKey = config.ACCESS_KEY;
const secretKey = config.SECRET_KEY;

const Utility = {
  /**
   * Creating hash of password by combining salt
   * @param {String} password
   * @return {String} encrypted password
   */
  createHash: (password) => {
    return new Promise((resolve, reject) => {
      bcrypt.hash(password, salt, (err, hash) => {
        err ? reject(err) : resolve(hash);
      });
    });
  },

  /**
   * Get signed token
   * @param {Integer} id userId
   * @return {String} auth token
   * @throws { Error } throws an error if there's an issue with the process
   */
  getSignedToken: (id) => {
    try {
      const token = jwt.sign({ id: id }, secret, {
        expiresIn: 86400,
      });
      return token;
    } catch (err) {
      console.error("JWT signing error:", err);
      throw err;
    }
  },

  /**
   * Comparing 2 passwords
   * @param {String} password
   * @param {String} hash
   * @return {Boolean} true/false
   */
  comparePassword: (password, hash) => {
    return new Promise((resolve, reject) => {
      bcrypt.compare(password, hash, (err, isMatch) => {
        err ? reject(err) : resolve(isMatch);
      });
    });
  },

  // upload the document to aws s3 bucket
  uploadToS3: async (folder, file, res) => {
    // Initialize an S3 client instance
    const s3Client = new S3Client({
      region: region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });

    // Set the parameters for the file you want to upload
    const params = {
      Bucket: bucketName,
      Key: folder,
      Body: file.data,
      ContentType: file.mimetype,
    };

    try {
      // Upload the file to S3 using the PutObjectCommand
      const data = await s3Client.send(new PutObjectCommand(params));
      // The uploaded file URL will need to be manually constructed since v3 doesn't directly return a location
      const fileLocation = `https://${bucketName}.s3.${region}.amazonaws.com/${folder}`;

      console.log('File uploaded successfully. File location:', fileLocation);
      if (res) {
        return res.status(200).send(
          Utility.formatResponse(200, fileLocation)
        );
      }

      // ✅ Otherwise return fileLocation for general usage
      return fileLocation;
    } catch (err) {
      console.log('Error uploading file:', err);
      return res.status(500).send(
        Utility.formatResponse(500, 'Error occurred while uploading the file')
      );
    }
  },

  /** Middleware to verify 'x-access-token' header in the incoming request.
   */
  verifyToken: (req, res, next) => {
    return new Promise((resolve, reject) => {
      const type = req.headers["type"];
      const token = req.headers["x-access-token"];
      if (!token) {
        resolve(
          res.status(401).send(Utility.formatResponse(401, `No Token Provided`))
        );
      } else {
        jwt.verify(token, secret, (err, decoded) => {
          try {
            if (err) {
              if (err.name === "TokenExpiredError") {
                // Handle expired token
                resolve(
                  res
                    .status(401)
                    .send(Utility.formatResponse(401, "Token Expired"))
                );
              } else {
                // Handle other verification errors
                resolve(
                  res
                    .status(500)
                    .send(
                      Utility.formatResponse(
                        500,
                        "Failed To Authenticate Token"
                      )
                    )
                );
              }
            } else {
              // Token is valid, proceed with the next middleware
              req.body.userId = decoded.id;
              resolve(next());
            }
          } catch (err) {
            resolve(
              res
                .status(500)
                .send(
                  Utility.formatResponse(500, `Failed To Authenticate Token`)
                )
            );
          }
        });
      }
    });
  },

  /**
   * Formatting the response with status code
   * @param {Integer} statusCode
   * @param {Object/String} res
   * @param {Integer} count
   * @return {Object} formatted api response
   */

  formatResponse: (statusCode, res, count) => {
    let status = "";
    switch (statusCode) {
      case 200:
      case 202:
      case 204:
        status = `Success`;
        break;
      case 400:
      case 401:
      case 403:
      case 404:
      case 408:
      case 409:
      case 429:
      case 500:
      case 502:
      case 503:
      case 505:
        status = "Error";
        break;
      default:
        status = "Success";
        break;
    }
    return status === "Success"
      ? count ? {
        status,
        data: res,
        count: count
      } : {
        status,
        data: res,
      }
      : {
        status,
        msg: res,
      };
  },

  generateJWT: (refId) => {
    const SECRET_KEY = "UTA5U1VEQXdNREF4TWpjM1QwUm5lRTFFV1hkTlJFVjZUbEU5UFE9PQ==";
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
      timestamp: Math.floor(Date.now() / 1000),
      partnerId: "CORP00001277",
      reqid: refId,
    };

    const base64url = (str) => Buffer.from(str).toString('base64').replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    const headerEncoded = base64url(JSON.stringify(header));
    const payloadEncoded = base64url(JSON.stringify(payload));
    const signingInput = `${headerEncoded}.${payloadEncoded}`;

    const signature = crypto.createHmac('sha256', SECRET_KEY).update(signingInput).digest('base64');
    const signatureEncoded = signature.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    return `${signingInput}.${signatureEncoded}`;
  },
};

module.exports = Utility;
