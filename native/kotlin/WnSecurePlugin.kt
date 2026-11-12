package app.whatnext.addon

import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Keeps small secrets (the AniList login token) in Android's encrypted storage. The key that protects them lives in the
 * Android Keystore and never leaves it, so the token is not readable from the app's ordinary files or from a backup.
 *
 * Every method can fail (some phones have a broken Keystore). The app then keeps using its normal storage, so a failure here
 * never logs anybody out. Values are never written to the log.
 */
@CapacitorPlugin(name = "WnSecure")
class WnSecurePlugin : Plugin() {
    private var cached: SharedPreferences? = null

    @Synchronized
    private fun store(): SharedPreferences {
        cached?.let { return it }
        val master = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        val prefs = EncryptedSharedPreferences.create(
            context,
            FILE,
            master,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
        cached = prefs
        return prefs
    }

    // Only the app's own "wn_" names, and nothing huge.
    private fun keyOf(call: PluginCall): String? {
        val k = call.getString("key") ?: return null
        return if (k.startsWith("wn_") && k.length <= 64) k else null
    }

    @PluginMethod
    fun get(call: PluginCall) {
        val k = keyOf(call) ?: return call.reject("bad key")
        try {
            val v = store().getString(k, null)
            val out = JSObject()
            if (v != null) out.put("value", v)
            call.resolve(out)
        } catch (e: Exception) {
            call.reject("secure store failed")
        }
    }

    @PluginMethod
    fun set(call: PluginCall) {
        val k = keyOf(call) ?: return call.reject("bad key")
        val v = call.getString("value") ?: return call.reject("no value")
        if (v.length > MAX_VALUE) return call.reject("value too long")
        try {
            if (store().edit().putString(k, v).commit()) call.resolve() else call.reject("secure store failed")
        } catch (e: Exception) {
            call.reject("secure store failed")
        }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val k = keyOf(call) ?: return call.reject("bad key")
        try {
            store().edit().remove(k).commit()
            call.resolve()
        } catch (e: Exception) {
            call.reject("secure store failed")
        }
    }

    companion object {
        private const val FILE = "wn_secure"
        private const val MAX_VALUE = 8192
    }
}
