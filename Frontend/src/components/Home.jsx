import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    clearAuth,
    endRunnerSession,
    getCurrentUser,
    getErrorMessage,
    getLeaderboard,
    getMySubmissions,
    getProblems,
    updateCurrentUser,
} from "../api";
import ProblemCard from "./ProblemCard";
import ProblemFormModal from "./ProblemFormModal";
import "../CSS/Home.css";

function Home() {
    const navigate = useNavigate();
    const [problems, setProblems] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [profileEditing, setProfileEditing] = useState(false);
    const [leaderboardOpen, setLeaderboardOpen] = useState(false);
    const [profile, setProfile] = useState(null);
    const [profileForm, setProfileForm] = useState({
        username: "",
        bio: "",
        profilePicture: "",
        socialLinks: { github: "", linkedin: "", website: "" },
        phone: "",
        resume: "",
    });
    const [submissions, setSubmissions] = useState([]);
    const [leaderboard, setLeaderboard] = useState([]);
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileError, setProfileError] = useState("");
    const [showPictureUrl, setShowPictureUrl] = useState(false);
    const [loadingProblems, setLoadingProblems] = useState(true);
    const [difficultyFilter, setDifficultyFilter] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");

    const token = localStorage.getItem("token");
    const isLoggedIn = Boolean(token);

    const fetchProblems = useCallback(async () => {
        try {
            setLoadingProblems(true);
            const res = await getProblems();
            setProblems(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingProblems(false);
        }
    }, []);

    useEffect(() => {
        fetchProblems();
    }, [fetchProblems]);

    useEffect(() => {
        if (!isLoggedIn) return;

        getCurrentUser()
            .then((res) => {
                setProfile(res.data);
                localStorage.setItem("email", res.data.email);
                localStorage.setItem("username", res.data.username || "");
                setProfileForm({
                    username: res.data.username || "",
                    bio: res.data.bio || "",
                    profilePicture: res.data.profilePicture || "",
                    socialLinks: {
                        github: res.data.socialLinks?.github || "",
                        linkedin: res.data.socialLinks?.linkedin || "",
                        website: res.data.socialLinks?.website || "",
                    },
                    phone: res.data.phone || "",
                    resume: res.data.resume || "",
                });
            })
            .catch((err) => {
                console.error(err);
            });
        getMySubmissions()
            .then((res) => setSubmissions(res.data))
            .catch((err) => console.error(err));
    }, [isLoggedIn]);

    useEffect(() => {
        getLeaderboard()
            .then((res) => setLeaderboard(res.data))
            .catch((err) => console.error(err));
    }, []);

    const handleLogout = () => {
        endRunnerSession({ immediate: true }); // stop the paid sandbox right away
        clearAuth();
        setProfile(null);
        setProfileOpen(false);
    };

    const requireLogin = () => {
        navigate("/login");
    };

    const visibleProblems = problems.filter((problem) => {
        const matchesDifficulty =
            difficultyFilter === "All" ||
            (problem.difficulty || "Easy") === difficultyFilter;
        const text = `${problem.problemId || ""} ${problem.title || ""} ${
            problem.statement || ""
        }`.toLowerCase();
        const matchesSearch = text.includes(searchQuery.trim().toLowerCase());

        return matchesDifficulty && matchesSearch;
    });

    const solvedCount = profile?.solvedProblems?.length || 0;
    const profileEmail = profile?.email || localStorage.getItem("email") || "User";
    const submittedProblemIds = new Set(submissions.map((item) => item.problemId));
    const solvedProblemIds = new Set(profile?.solvedProblems || []);
    const submittedProblems = problems.filter((item) =>
        submittedProblemIds.has(item.problemId),
    );
    const solvedProblems = problems.filter((item) =>
        solvedProblemIds.has(item.problemId),
    );
    const unsolvedProblems = problems.filter(
        (item) => !solvedProblemIds.has(item.problemId),
    );

    const updateProfileField = (field, value) => {
        setProfileForm((current) => ({ ...current, [field]: value }));
    };

    const updateSocialField = (field, value) => {
        setProfileForm((current) => ({
            ...current,
            socialLinks: { ...current.socialLinks, [field]: value },
        }));
    };

    const resetProfileForm = () => {
        setProfileForm({
            username: profile?.username || "",
            bio: profile?.bio || "",
            profilePicture: profile?.profilePicture || "",
            socialLinks: {
                github: profile?.socialLinks?.github || "",
                linkedin: profile?.socialLinks?.linkedin || "",
                website: profile?.socialLinks?.website || "",
            },
            phone: profile?.phone || "",
            resume: profile?.resume || "",
        });
        setProfileError("");
        setShowPictureUrl(false);
    };

    const handleProfileImageFile = (file) => {
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            setProfileError("Please choose an image file.");
            return;
        }

        if (file.size > 1400000) {
            setProfileError("Please choose an image smaller than 1.4 MB.");
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            updateProfileField("profilePicture", reader.result || "");
            setProfileError("");
        };
        reader.readAsDataURL(file);
    };

    const saveProfile = async (e) => {
        e.preventDefault();
        try {
            setProfileSaving(true);
            setProfileError("");
            const res = await updateCurrentUser(profileForm);
            setProfile(res.data);
            localStorage.setItem("username", res.data.username || "");
            setProfileEditing(false);
            setShowPictureUrl(false);
        } catch (err) {
            setProfileError(getErrorMessage(err, "Could not save profile changes."));
        } finally {
            setProfileSaving(false);
        }
    };

    const profileName = profile?.username || profileEmail;
    const profileInitial = profileName.charAt(0).toUpperCase();
    const brandLetters = "Top Coders".split("");

    return (
        <div className="home-container">
            <div className="brand-strip">
                <span className="brand-name" aria-label="Top Coders">
                    {brandLetters.map((letter, index) => (
                        <span
                            className={letter === " " ? "brand-space" : ""}
                            key={`${letter}-${index}`}
                            style={{ "--letter-index": index }}
                            aria-hidden="true"
                        >
                            {letter === " " ? "\u00a0" : letter}
                        </span>
                    ))}
                </span>
            </div>
            <header className="home-header">
                <div>
                    <p className="eyebrow">Top Coders Online Judge</p>
                    <h1>Practice problems</h1>
                </div>

                <div className="header-actions">
                    <button
                        className="secondary-btn"
                        onClick={() => setLeaderboardOpen(true)}
                    >
                        Leaderboard
                    </button>
                    <button
                        className="secondary-btn"
                        onClick={() =>
                            isLoggedIn ? setShowModal(true) : requireLogin()
                        }
                    >
                        Create Problem
                    </button>
                    {isLoggedIn ? (
                        <button
                            className="profile-trigger"
                            onClick={() => setProfileOpen(true)}
                        >
                            <span>{profileEmail.charAt(0).toUpperCase()}</span>
                            Profile
                        </button>
                    ) : (
                        <button className="primary-btn" onClick={requireLogin}>
                            Login
                        </button>
                    )}
                </div>
            </header>

            <section className="home-toolbar">
                <label className="problem-search">
                    <span>Search</span>
                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search problems"
                    />
                </label>
                <div>
                    <strong>{problems.length}</strong>
                    <span>problems available</span>
                </div>
                <div>
                    <strong>{solvedCount}</strong>
                    <span>solved by you</span>
                </div>
                <select
                    value={difficultyFilter}
                    onChange={(e) => setDifficultyFilter(e.target.value)}
                    aria-label="Filter by difficulty"
                >
                    <option value="All">All difficulties</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                </select>
            </section>

            {showModal && (
                <ProblemFormModal
                    close={() => setShowModal(false)}
                    refresh={fetchProblems}
                />
            )}

            <div className="problem-list">
                {loadingProblems && (
                    <div className="empty-state">Loading problems...</div>
                )}

                {!loadingProblems &&
                    visibleProblems.map((p, index) => (
                        <ProblemCard
                            key={p.problemId || p._id}
                            problem={{ ...p, index: index + 1 }}
                            refresh={fetchProblems}
                            isLoggedIn={isLoggedIn}
                            onLoginRequired={requireLogin}
                        />
                    ))}

                {!loadingProblems && visibleProblems.length === 0 && (
                    <div className="empty-state">
                        No problems match this filter yet.
                    </div>
                )}
            </div>

            {profileOpen && (
                <div
                    className="drawer-backdrop"
                    onClick={() => setProfileOpen(false)}
                >
                    <aside
                        className="profile-drawer"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="drawer-topbar">
                            <button
                                className="drawer-close"
                                onClick={() => {
                                    setProfileOpen(false);
                                }}
                                aria-label="Close profile"
                            >
                                x
                            </button>
                        </div>

                        <div className="profile-scroll">
                            <div className="profile-hero">
                                <div className="profile-avatar large">
                                    {(profileEditing
                                        ? profileForm.profilePicture
                                        : profile?.profilePicture) ? (
                                        <img
                                            src={
                                                profileEditing
                                                    ? profileForm.profilePicture
                                                    : profile.profilePicture
                                            }
                                            alt=""
                                        />
                                    ) : (
                                        profileInitial
                                    )}
                                </div>
                                <div>
                                    <p className="eyebrow">Profile</p>
                                    <h2>{profileName}</h2>
                                    <p>{profile?.bio || "Ready to solve."}</p>
                                </div>
                            </div>

                            <div className="profile-stats">
                                <div>
                                    <strong>{solvedCount}</strong>
                                    <span>Solved</span>
                                </div>
                                <div>
                                    <strong>{submittedProblems.length}</strong>
                                    <span>Submitted</span>
                                </div>
                                <div>
                                    <strong>{unsolvedProblems.length}</strong>
                                    <span>Remaining</span>
                                </div>
                            </div>

                            {!profileEditing && (
                                <>
                                    <div className="profile-info-card">
                                        <div>
                                            <span>Email</span>
                                            <strong>{profileEmail}</strong>
                                        </div>
                                        <div>
                                            <span>Phone</span>
                                            <strong>
                                                {profile?.phone || "Not added"}
                                            </strong>
                                        </div>
                                        <div>
                                            <span>Resume</span>
                                            {profile?.resume ? (
                                                <a
                                                    href={profile.resume}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    Open resume
                                                </a>
                                            ) : (
                                                <strong>Not added</strong>
                                            )}
                                        </div>
                                    </div>

                                    <div className="profile-links">
                                        {profile?.socialLinks?.github && (
                                            <a
                                                href={profile.socialLinks.github}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                GitHub
                                            </a>
                                        )}
                                        {profile?.socialLinks?.linkedin && (
                                            <a
                                                href={profile.socialLinks.linkedin}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                LinkedIn
                                            </a>
                                        )}
                                        {profile?.socialLinks?.website && (
                                            <a
                                                href={profile.socialLinks.website}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Website
                                            </a>
                                        )}
                                        {!profile?.socialLinks?.github &&
                                            !profile?.socialLinks?.linkedin &&
                                            !profile?.socialLinks?.website && (
                                                <span>No social links added.</span>
                                            )}
                                    </div>

                                    <div className="profile-lists compact">
                                        <div>
                                            <h3>Solved Problems</h3>
                                            <p>{solvedProblems.length || 0} solved</p>
                                            <ul>
                                                {solvedProblems
                                                    .slice(0, 4)
                                                    .map((item) => (
                                                        <li key={item.problemId}>
                                                            {item.title}
                                                        </li>
                                                    ))}
                                            </ul>
                                        </div>
                                    </div>
                                </>
                            )}

                            {profileEditing && (
                                <form className="profile-form" onSubmit={saveProfile}>
                                    <div className="photo-actions">
                                        <input
                                            id="profile-picture-upload"
                                            type="file"
                                            accept="image/*"
                                            hidden
                                            onChange={(e) =>
                                                handleProfileImageFile(
                                                    e.target.files?.[0],
                                                )
                                            }
                                        />
                                        <button
                                            type="button"
                                            className="secondary-btn"
                                            onClick={() => {
                                                document
                                                    .getElementById(
                                                        "profile-picture-upload",
                                                    )
                                                    ?.click();
                                            }}
                                        >
                                            Upload photo
                                        </button>
                                        <button
                                            type="button"
                                            className="secondary-btn"
                                            onClick={() =>
                                                setShowPictureUrl((value) => !value)
                                            }
                                        >
                                            Other source
                                        </button>
                                    </div>

                                    {showPictureUrl && (
                                        <label>
                                            Picture source URL
                                            <input
                                                value={profileForm.profilePicture}
                                                onChange={(e) =>
                                                    updateProfileField(
                                                        "profilePicture",
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="https://..."
                                            />
                                        </label>
                                    )}

                                    <label>
                                        User name
                                        <input
                                            value={profileForm.username}
                                            onChange={(e) =>
                                                updateProfileField(
                                                    "username",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Your display name"
                                        />
                                    </label>
                                    <label>
                                        Description
                                        <textarea
                                            value={profileForm.bio}
                                            onChange={(e) =>
                                                updateProfileField(
                                                    "bio",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Competitive programmer, backend learner..."
                                        />
                                    </label>
                                    <label>
                                        Phone number (private, only you see it)
                                        <input
                                            value={profileForm.phone}
                                            onChange={(e) =>
                                                updateProfileField(
                                                    "phone",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="+91 98765 43210"
                                        />
                                    </label>
                                    <label>
                                        GitHub
                                        <input
                                            value={profileForm.socialLinks.github}
                                            onChange={(e) =>
                                                updateSocialField(
                                                    "github",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="https://github.com/..."
                                        />
                                    </label>
                                    <label>
                                        LinkedIn
                                        <input
                                            value={profileForm.socialLinks.linkedin}
                                            onChange={(e) =>
                                                updateSocialField(
                                                    "linkedin",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="https://linkedin.com/in/..."
                                        />
                                    </label>
                                    <label>
                                        Website
                                        <input
                                            value={profileForm.socialLinks.website}
                                            onChange={(e) =>
                                                updateSocialField(
                                                    "website",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="https://..."
                                        />
                                    </label>
                                    <label>
                                        Resume URL
                                        <input
                                            value={profileForm.resume}
                                            onChange={(e) =>
                                                updateProfileField(
                                                    "resume",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="https://.../resume.pdf"
                                        />
                                    </label>
                                    {profileError && (
                                        <div className="profile-error">
                                            {profileError}
                                        </div>
                                    )}
                                    <div className="profile-edit-actions">
                                        <button
                                            type="button"
                                            className="secondary-btn"
                                            onClick={() => {
                                                resetProfileForm();
                                                setProfileEditing(false);
                                            }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            className="primary-btn"
                                            disabled={profileSaving}
                                        >
                                            {profileSaving
                                                ? "Saving..."
                                                : "Save profile"}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>

                        <div className="profile-footer">
                            <button
                                className="secondary-btn"
                                onClick={() => {
                                    if (profileEditing) {
                                        resetProfileForm();
                                    }
                                    setProfileEditing((value) => !value);
                                }}
                            >
                                {profileEditing ? "View profile" : "Edit profile"}
                            </button>
                            <button className="logout-btn" onClick={handleLogout}>
                                Logout
                            </button>
                        </div>
                    </aside>
                </div>
            )}

            {leaderboardOpen && (
                <div
                    className="drawer-backdrop"
                    onClick={() => setLeaderboardOpen(false)}
                >
                    <aside
                        className="profile-drawer leaderboard-drawer"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="drawer-close"
                            onClick={() => setLeaderboardOpen(false)}
                            aria-label="Close leaderboard"
                        >
                            x
                        </button>
                        <p className="eyebrow">Top users</p>
                        <h2>Leaderboard</h2>
                        <div className="leaderboard-list">
                            {leaderboard.map((user) => {
                                const isCurrent =
                                    user.userId === localStorage.getItem("userId");
                                return (
                                    <article
                                        className={`leaderboard-row ${
                                            isCurrent ? "current-user" : ""
                                        }`}
                                        key={user.userId}
                                    >
                                        <span className="leaderboard-rank">
                                            #{user.rank}
                                        </span>
                                        <span className="leaderboard-avatar">
                                            {user.profilePicture ? (
                                                <img
                                                    src={user.profilePicture}
                                                    alt=""
                                                />
                                            ) : (
                                                (user.username || "U")
                                                    .charAt(0)
                                                    .toUpperCase()
                                            )}
                                        </span>
                                        <span className="leaderboard-user">
                                            <strong>{user.username}</strong>
                                            <small>{user.bio || "Ready to solve."}</small>
                                        </span>
                                        <strong>{user.solvedCount}</strong>
                                    </article>
                                );
                            })}
                            {leaderboard.length === 0 && (
                                <div className="empty-state">
                                    No leaderboard data yet.
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}

export default Home;
