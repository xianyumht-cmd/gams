plugins {
    id("com.android.application")
}

android {
    namespace = "com.jinli.keygen"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.jinli.keygen"
        minSdk = 24
        targetSdk = 35
        versionCode = 7
        versionName = "1.3.0"
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("debug")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// control-center legacy workflow markers
// versionCode = 6
// versionName = "1.2.1"
