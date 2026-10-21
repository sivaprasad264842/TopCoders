import path from "node:path";

const JVM_FLAGS = [
    "-Xms32m",
    "-Xmx256m",
    "-Xss64m",
    "-XX:+UseSerialGC",
    "-XX:ReservedCodeCacheSize=32m",
    "-XX:MaxMetaspaceSize=64m",
];

/**
 * How each language is written to disk, compiled (optional) and run.
 * `compile` and `run` receive the job directory and return [command, args].
 */
export const LANGUAGES = {
    cpp: {
        sourceFile: "code.cpp",
        compile: () => ["g++", ["-O2", "-o", "main", "code.cpp"]],
        run: (jobDir) => [path.join(jobDir, "main"), []],
    },
    java: {
        sourceFile: "Main.java",
        compile: () => [
            "javac",
            [...JVM_FLAGS.filter((f) => !f.startsWith("-Xss")).map((f) => `-J${f}`), "Main.java"],
        ],
        run: () => ["java", [...JVM_FLAGS, "Main"]],
    },
    python: {
        sourceFile: "code.py",
        run: () => ["python3", ["-B", "code.py"]],
    },
    javascript: {
        sourceFile: "code.js",
        run: () => ["node", ["code.js"]],
    },
};

export const isSupportedLanguage = (language) =>
    Object.prototype.hasOwnProperty.call(LANGUAGES, language);
