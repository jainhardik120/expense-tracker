package com.jainhardik120.expensetracker.parser.core.bank

object BankParserFactory {

    private val parsers = listOf(
        HDFCBankParser(),
        SBIBankParser(),
        SaraswatBankParser(),
        DBSBankParser(),
        IndianBankParser(),
        FederalBankParser(),
        JuspayParser(),
        SliceParser(),
        LazyPayParser(),
        UtkarshBankParser(),
        ICICIBankParser(),
        KarnatakaBankParser(),
        KeralaGraminBankParser(),
        IDBIBankParser(),
        JupiterBankParser(),
        AxisBankParser(),
        PNBBankParser(),
        CanaraBankParser(),
        BankOfBarodaParser(),
        BankOfIndiaParser(),
        JioPaymentsBankParser(),
        KotakBankParser(),
        IDFCFirstBankParser(),
        UnionBankParser(),
        HSBCBankParser(),
        CentralBankOfIndiaParser(),
        SouthIndianBankParser(),
        JKBankParser(),
        JioPayParser(),
        IPPBParser(),
        CityUnionBankParser(),
        IndianOverseasBankParser(),
        AirtelPaymentsBankParser(),
        IndusIndBankParser(),
        AMEXBankParser(),
        OneCardParser(),
        PluxeeParser(),
        UCOBankParser(),
        AUBankParser(),
        YesBankParser(),
        BandhanBankParser(),
        ADCBParser(),
        FABParser(),
        EmiratesNBDParser(),
        LivBankParser(),
        CitiBankParser(),
        DiscoverCardParser(),
        OldHickoryParser(),
        LaxmiBankParser(),
        CBEBankParser(),
        EverestBankParser(),
        BancolombiaParser(),
        MashreqBankParser(),
        CharlesSchwabParser(),
        NavyFederalParser(),
        AdelFiParser(),
        PriorbankParser(),
        AlinmaBankParser(),
        NMBBankParser(),
        SiddharthaBankParser(),
        MPesaTanzaniaParser(),
        MPESAParser(),
        SelcomPesaParser(),
        TigoPesaParser(),
        CIBEgyptParser(),
        DhanlaxmiBankParser(),
        HuntingtonBankParser(),
        StandardCharteredBankParser()
    )

    fun getParser(sender: String): BankParser? {
        return parsers.firstOrNull { it.canHandle(sender) }
    }

    fun getParserByName(bankName: String): BankParser? {
        return parsers.firstOrNull { it.getBankName() == bankName }
    }

    fun getAllParsers(): List<BankParser> = parsers

    fun isKnownBankSender(sender: String): Boolean {
        return parsers.any { it.canHandle(sender) }
    }
}
