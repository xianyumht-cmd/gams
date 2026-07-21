plugins {
    id("com.android.application")
}

android {
    namespace = "com.jinli.quickweb"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.jinli.quickweb"
        minSdk = 24
        targetSdk = 35
        versionCode = 8
        versionName = "1.4.0"
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

dependencies {
    implementation("androidx.webkit:webkit:1.16.0")
}
