import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)

    id("com.google.devtools.ksp")
    id("com.google.dagger.hilt.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

fun lp(key: String): String =
    localProps.getProperty(key) ?: System.getenv(key) ?: ""

android {
    namespace = "com.jainhardik120.expensetracker"
    compileSdk {
        version = release(36)
    }

    defaultConfig {
        applicationId = "com.jainhardik120.expensetracker"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        manifestPlaceholders["appAuthRedirectScheme"] = "expense-tracker"

        buildConfigField("String", "AUTH_BASE_URL", "\"${lp("AUTH_BASE_URL")}\"")
        buildConfigField("String", "AUTH_CLIENT_ID", "\"${lp("AUTH_CLIENT_ID")}\"")
        buildConfigField("String", "AUTH_RESOURCE", "\"${lp("AUTH_RESOURCE")}\"")
        buildConfigField("String", "AUTH_REDIRECT_URI", "\"${lp("AUTH_REDIRECT_URI")}\"")

        // if you want full endpoints derived
        buildConfigField(
            "String",
            "AUTH_AUTHORIZE_URL",
            "\"${lp("AUTH_BASE_URL")}${lp("AUTH_AUTHORIZE_PATH")}\""
        )
        buildConfigField(
            "String",
            "AUTH_TOKEN_URL",
            "\"${lp("AUTH_BASE_URL")}${lp("AUTH_TOKEN_PATH")}\""
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    implementation(libs.appauth)

    implementation(libs.hilt.android)
    ksp(libs.hilt.android.compiler)

    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.ktor.client.logging)

    implementation(libs.kotlinx.coroutines.android)

    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.security.crypto)
    implementation(libs.ktor.client.auth)
    implementation(libs.androidx.hilt.navigation.compose)
}