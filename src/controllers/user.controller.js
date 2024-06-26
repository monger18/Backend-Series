import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";
import jwt from "jsonwebtoken";

const generateAccessandRefereshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refereshToken = user.generateRefereshToken();

        user.refereshToken = refereshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refereshToken };
    } catch (error) {
        throw new ApiError(
            500,
            "Something went wrong while generating access and referesh token"
        );
    }
};

const registerUser = asyncHandler(async (req, res) => {
    //1 //get user details from frontend
    //2 //validation--not empty
    //3 //check if user already exists: username,email
    //4 //check for images,check for avatar
    //5 //upload them to cloudinary, avatar
    //6  //create user object --create entry in db
    //7 //remove password and refersh token field from response
    //8 //check for user creation
    //9 //return res

    //1
    const { fullName, email, username, password } = req.body;

    //2
    if (
        [fullName, email, username, password].some(
            (field) => field?.trim() === ""
        )
    ) {
        throw new ApiError(400, "All fields are required");
    }

    //3
    const existedUser = await User.findOne({
        $or: [{ username }, { email }],
    });
    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists");
    }

    //4

    //\
    console.log(req.files);
    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if (
        req.files &&
        Array.isArray(req.files.coverImage) &&
        req.files.coverImage.length > 0
    ) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }
    if (!avatarLocalPath) throw new ApiError(400, "Avatar file is required");

    //5

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!avatar) throw new ApiError(400, "Avatar file is required");

    //6

    const user = await User.create({
        fullName,
        email,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase(),
    });
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if (!createdUser)
        throw new ApiError(
            500,
            "Something went wrong while registring the user"
        );

    return res
        .status(201)
        .json(
            new ApiResponse(200, createdUser, "User registered Successfully")
        );
});

const loginUser = asyncHandler(async (req, res) => {
    //req->body se data
    //username or email
    //find the user
    //check the password
    //generate access token and refresh token
    //send cookies
    //send the response

    //1
    const { email, username, password } = req.body;

    //2
    if (!(email || username))
        throw new ApiError(400, "username or email is required");

    const user = await User.findOne({
        $or: [{ username }, { email }],
    });

    if (!user) throw new ApiError(404, "User does not exists");

    //4

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) throw new ApiError(401, "Password is incorrect");

    //5

    const { accessToken, refereshToken } = await generateAccessandRefereshToken(
        user._id
    );

    //6

    const loggedInUser = await User.findById(user._id).select(
        "-password -refereshToken"
    );

    const options = {
        httpOnly: true,
        secure: true,
    };

    //7

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refereshToken", refereshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refereshToken,
                },
                "User Logged in Successfully"
            )
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refereshToken: undefined,
            },
        },
        {
            new: true,
        }
    );
    const options = {
        httpOnly: true,
        secure: true,
    };
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refereshToken", options)
        .json(new ApiResponse(200, {}, "User Logged Out Successfully"));
});

const refereshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefereshToken =
        req.cookies.refereshToken || req.body.refereshToken;
    if (!incomingRefereshToken) throw new ApiError(401, "Unauthorized request");

    try {
        const decodedToken = jwt.verify(
            incomingRefereshToken,
            process.env.REFERESH_TOKEN_SECRET
        );

        const user = await User.findById(decodedToken?._id);
        if (!user) throw new ApiError(401, "Invalid Request Token");

        if (incomingRefereshToken !== user?.refereshToken)
            throw new ApiError(401, "Referesh token is expired used");

        const options = {
            httpOnly: true,
            secure: true,
        };

        const { accessToken, newrefereshToken } =
            await generateAccessandRefereshToken(user._id);

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refereshToken", newrefereshToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, newrefereshToken },
                    "Access Token refereshed"
                )
            );
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid Referesh Token");
    }
});

const changeCurrentUserPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user?._id);
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old Password");
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password Changed Successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(
            new ApiResponse(200, req.user, "Current User fetched Successfully")
        );
});

const updateUserDetails = asyncHandler(async (req, res) => {
    const { username, email } = req.body;
    if (!username || !email) {
        throw new ApiError(400, "All fields are required");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        { $set: { username: username, email: email } },
        { new: true }
    ).select("-password");
    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "Account details updated Successfully")
        );
});

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path;

    if (!avatarLocalPath) throw new ApiError(400, "Avatar file is missing");

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar.url) throw new ApiError(400, "Error while uploading on Avatar");

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url,
            },
        },
        { new: true }
    ).select("-password");

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const CoverImageLocalPath = req.file?.path;

    if (!CoverImageLocalPath)
        throw new ApiError(400, "Cover Image file is missing");

    const coverImage = await uploadOnCloudinary(CoverImageLocalPath);

    if (!coverImage.url)
        throw new ApiError(400, "Error while uploading on cover Image");

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url,
            },
        },
        { new: true }
    ).select("-password");

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Cover Image updated successfully"));
});

//aggergation pipelines
const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.params;

    if (!username?.trim()) {
        throw new ApiError(400, "username is missing");
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase(),
            },
            $lookup: {
                from: "subscription",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers",
            },
            $lookup: {
                from: "subscription",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo",
            },
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers",
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo",
                },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false,
                    },
                },
            },
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1,
            },
        },
    ]);

    if (channel?.lenght) {
        throw new ApiError(404, "channel does not exists");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                channel[0],
                "User Channel fetched Successfully"
            )
        );
});

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id),
            },
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1,
                                    },
                                },
                            ],
                        },
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner",
                            },
                        },
                    },
                ],
            },
        },
    ]);

    return res
        .status(200)
        .json(
            new ApiResponse(200, user[0].watchHistory, "Watch History Fetched")
        );
});

export {
    registerUser,
    loginUser,
    logoutUser,
    refereshAccessToken,
    getCurrentUser,
    changeCurrentUserPassword,
    updateUserDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory,
};
