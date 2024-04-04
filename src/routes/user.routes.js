import { Router } from "express";
import {
    loginUser,
    logoutUser,
    registerUser,
    refereshAccessToken,
    changeCurrentUserPassword,
    getCurrentUser,
    updateUserDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory,
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import multer from "multer";

const api = Router();

router.route("/register").post(
    upload.fields([
        {
            name: "avatar",
            maxCount: 1,
        },
        {
            name: "coverImage",
            maxCount: 1,
        },
    ]),
    registerUser
);

router.route("/login").post(loginUser);

//secured routes
router.route("/logout").post(verifyJwt, logoutUser);
router.route("/referesh-token").post(refereshAccessToken);
router.route("/change-password").post(verifyJwt, changeCurrentUserPassword);
router.route("/current-user").get(verifyJwt, getCurrentUser);
router.route("/update").patch(updateUserDetails);
router
    .route("/avatar")
    .patch(verifyJwt, upload.single("avatar"), updateUserAvatar);
router
    .route("/cover-Image")
    .patch(verifyJwt, uplaod.single("/coverImage"), updateUserCoverImage);
router.route("/c/:username").get(verifyJwt, getUserChannelProfile);
router.route("/history").get(verifyJwt, getWatchHistory);

export default router;
